const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');

// Ensure data directory exists on load
if (!fs.existsSync(DATA_DIR)) {
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch (e) {
        console.error("CRITICAL: Failed to create ./data directory.", e);
    }
}

function getFilePath(fileName) {
    const name = fileName.endsWith('.oneway') ? fileName : `${fileName}.oneway`;
    return path.join(DATA_DIR, name);
}

const dbManager = {
    // Initialize default files
    init: () => {
        const defaults = [
            { file: 'users.oneway', data: {} },
            { file: 'wars.oneway', data: [] },
            { file: 'settings.oneway', data: { roles: {}, blacklist: [] } }
        ];

        defaults.forEach(item => {
            const filePath = getFilePath(item.file);
            if (!fs.existsSync(filePath)) {
                dbManager.write(item.file, item.data);
                console.log(`[DB] Created default: ${item.file}`);
            }
        });
    },

    // Read data safely
    read: (fileName) => {
        const filePath = getFilePath(fileName);
        if (!fs.existsSync(filePath)) {
            return null;
        }
        try {
            const data = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            console.error(`[DB] Error reading ${fileName}:`, error);
            return null;
        }
    },

    // Write data safely
    write: (fileName, data) => {
        const filePath = getFilePath(fileName);
        try {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
            return true;
        } catch (error) {
            console.error(`[DB] Error writing to ${fileName}:`, error);
            return false;
        }
    }
};

module.exports = dbManager;
