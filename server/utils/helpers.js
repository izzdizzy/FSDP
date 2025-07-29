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
    const requestedFiles = [];
    const messageLower = message.toLowerCase();

    // Match by partial or full name (case-insensitive)
    for (const doc of availableDocuments) {
        const fileNameLower = doc.originalName.toLowerCase();
        const fileNameWithoutExt = path.parse(doc.originalName).name.toLowerCase();
        if (messageLower.includes(fileNameLower) || 
            messageLower.includes(fileNameWithoutExt) ||
            messageLower.includes(doc.originalName.toLowerCase())) {
            requestedFiles.push(doc);
        }
    }

    // Match by explicit file number
    const fileNumberMatch = messageLower.match(/(?:file|document|doc)\s*(\d+)/g);
    if (fileNumberMatch && availableDocuments.length > 0) {
        fileNumberMatch.forEach(match => {
            const numberMatch = match.match(/(\d+)/);
            if (numberMatch) {
                const fileIndex = parseInt(numberMatch[1]) - 1;
                if (fileIndex >= 0 && fileIndex < availableDocuments.length) {
                    if (!requestedFiles.find(f => f.id === availableDocuments[fileIndex].id)) {
                        requestedFiles.push(availableDocuments[fileIndex]);
                    }
                }
            }
        });
    }

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
        const maxLength = 2000;
        return relevantText.length > maxLength ? relevantText.substring(0, maxLength) + '... [truncated]' : relevantText;
    } catch (error) {
        return '[Error extracting relevant text]';
    }
};

module.exports = {
    readFileContent,
    analyzeUserMessageForFiles,
    isFileRelatedQuery,
    callBedrock,
    extractRelevantText,
    delay,
    getDB
};
