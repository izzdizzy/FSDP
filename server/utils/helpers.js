const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const XLSX = require('xlsx');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const sqlite3 = require('sqlite3').verbose();

// AWS Bedrock Configuration (should be shared, but for helpers, re-create if needed)
const bedrockClient = new BedrockRuntimeClient({
    region: process.env.AWS_REGION || 'ap-southeast-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
});

let dbInstance;

const getDB = () => {
    if (!dbInstance) {
        dbInstance = new sqlite3.Database('./database.sqlite', (err) => {
            if (err) {
                console.error('Database connection error:', err.message);
                throw err;
            }
        });
    }
    return dbInstance;
};

const readFileContent = async (filePath, originalName) => {
    try {
        const extension = path.extname(originalName).toLowerCase();
        if (extension === '.pdf') {
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdfParse(dataBuffer);
            return data.text;
        }
        if (extension === '.docx') {
            const result = await mammoth.extractRawText({ path: filePath });
            return result.value;
        }
        if (extension === '.doc') {
            return '[DOC file detected - full text extraction not supported in this implementation]';
        }
        if (['.txt', '.md', '.csv'].includes(extension)) {
            return fs.readFileSync(filePath, 'utf8');
        }
        if (extension === '.xlsx' || extension === '.xls') {
            const workbook = XLSX.readFile(filePath);
            let excelText = '';
            workbook.SheetNames.forEach(sheetName => {
                const sheet = workbook.Sheets[sheetName];
                excelText += `\nSheet: ${sheetName}\n`;
                excelText += XLSX.utils.sheet_to_csv(sheet);
            });
            return excelText;
        }
        return `[Unsupported file format: ${extension}]`;
    } catch (error) {
        return `[Error reading file: ${error.message}]`;
    }
};

const analyzeUserMessageForFiles = (message, availableDocuments) => {
    // Only reference files that are explicitly mentioned by the user.
    // This prevents referencing any file that is not directly asked for.
    const requestedFiles = [];
    const messageLower = message.toLowerCase();

    // Match by explicit file/document name (case-insensitive, must be exact or close match)
    for (const doc of availableDocuments) {
        const fileNameLower = doc.originalName.toLowerCase();
        const fileNameWithoutExt = path.parse(doc.originalName).name.toLowerCase();
        // Only add if the user message contains the full name or a clear reference
        // (e.g., "Staff Handbook_May 2025.pdf" or "Staff Handbook")
        if (
            messageLower.includes(fileNameLower) ||
            (fileNameWithoutExt.length > 4 && messageLower.includes(fileNameWithoutExt))
        ) {
            requestedFiles.push(doc);
        }
    }

    // Match by explicit file/document number (e.g., "file 2", "document 1")
    const fileNumberMatch = messageLower.match(/(?:file|document|doc)\s*(\d+)/g);
    if (fileNumberMatch && availableDocuments.length > 0) {
        fileNumberMatch.forEach(match => {
            const numberMatch = match.match(/(\d+)/);
            if (numberMatch) {
                const fileIndex = parseInt(numberMatch[1]) - 1;
                if (fileIndex >= 0 && fileIndex < availableDocuments.length) {
                    // Only add if not already included
                    if (!requestedFiles.find(f => f.id === availableDocuments[fileIndex].id)) {
                        requestedFiles.push(availableDocuments[fileIndex]);
                    }
                }
            }
        });
    }

    // Edge case: If no explicit reference, do not return any file
    // This ensures strict referencing
    return requestedFiles;
};

const isFileRelatedQuery = (message) => {
    const fileKeywords = [
        'document', 'file', 'pdf', 'upload', 'handbook', 'manual', 'report', 
        'policy', 'procedure', 'guideline', 'attachment', 'doc', 'sheet'
    ];
    const messageLower = message.toLowerCase();
    return fileKeywords.some(keyword => messageLower.includes(keyword));
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const callBedrock = async (prompt, retryCount = 0, maxTokens = 1000) => {
    try {
        const modelId = 'anthropic.claude-v2';
        const input = {
            modelId: modelId,
            contentType: 'application/json',
            accept: 'application/json',
            body: JSON.stringify({
                anthropic_version: "bedrock-2023-05-31",
                max_tokens: maxTokens,
                messages: [
                    {
                        role: "user",
                        content: prompt
                    }
                ]
            })
        };
        const command = new InvokeModelCommand(input);
        const response = await bedrockClient.send(command);
        const decodedResponseBody = new TextDecoder().decode(response.body);
        const responseBody = JSON.parse(decodedResponseBody);
        return responseBody.content[0].text.trim();
    } catch (error) {
        if (error.name === 'ThrottlingException' && retryCount < 3) {
            const delayMs = Math.pow(2, retryCount) * 1000;
            await delay(delayMs);
            return callBedrock(prompt, retryCount + 1, maxTokens);
        }
        throw new Error('Failed to get response from AI model');
    }
};

const extractRelevantText = (content, query) => {
    try {
        const queryWords = query.toLowerCase().split(/\s+/);
        const contentLines = content.split('\n');
        const relevantLines = contentLines.filter(line => {
            const lineLower = line.toLowerCase();
            return queryWords.some(word => lineLower.includes(word));
        });
        const relevantText = relevantLines.join('\n');
        const maxLength = 5000;
        return relevantText.length > maxLength ? relevantText.substring(0, maxLength) + '... [truncated]' : relevantText;
    } catch (error) {
        return '[Error extracting relevant text]';
    }
};

const generateChatTopic = (message) => {
    // Simple logic to generate a topic based on the message
    // Replace this with AI or more complex logic if needed
    return message.split(' ').slice(0, 3).join(' ').trim() || 'General';
};

/**
 * Extracts a specific section from a TXT document based on section reference.
 * For other file types, returns an error (extend as needed).
 * @param {string} filePath - Path to the document file.
 * @param {string} sectionRef - Section reference, e.g., "1.1"
 * @returns {Promise<{text: string, error?: string}>}
 */
async function extractSectionFromDocument(filePath, sectionRef) {
  const ext = path.extname(filePath).toLowerCase();
  try {
    if (ext === '.txt') {
      // For TXT, use regex to find section header and extract until next header
      const content = await fs.promises.readFile(filePath, 'utf8');
      // Match section header (e.g., "1.1 Title") and extract until next section header
      const sectionRegex = new RegExp(`^${sectionRef.replace('.', '\\.')}(?:\\s+|\\.)(.+)$`, 'm');
      const match = content.match(sectionRegex);
      if (!match) return { error: `Section ${sectionRef} not found.` };
      // Optionally, extract until next section header (advanced: implement multi-line extraction)
      return { text: match[1].trim() };
    }
    // Extend for PDF/DOCX as needed
    return { error: 'Unsupported file type for section extraction.' };
  } catch (err) {
    return { error: `Error reading file: ${err.message}` };
  }
}

/**
 * Parses user message for section requests, e.g., "section 1.1 of Staff Handbook"
 * Returns { document, section } if found, else null.
 */
function parseSectionRequest(message, documents) {
  const sectionMatch = message.match(/section\s+(\d+(?:\.\d+)*)\s+of\s+([\w\s\-\.]+?)(?:\.|$)/i);
  if (!sectionMatch) return null;
  const section = sectionMatch[1];
  const docName = sectionMatch[2].trim();
  const document = documents.find(doc => doc.originalName.toLowerCase().includes(docName.toLowerCase()));
  if (!document) return null;
  return { document, section };
}

module.exports = {
    readFileContent,
    analyzeUserMessageForFiles,
    isFileRelatedQuery,
    callBedrock,
    extractRelevantText,
    generateChatTopic,
    delay,
    getDB,
    extractSectionFromDocument,
    parseSectionRequest
};
