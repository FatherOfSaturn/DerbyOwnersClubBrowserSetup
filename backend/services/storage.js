const fs = require('fs');
const path = require('path');

function getPath(filename) {
    return path.join(__dirname, '..', 'data', filename);
}

function readJson(filename) {
    const file = getPath(filename);

    if (!fs.existsSync(file)) {
        return {};
    }

    const content = fs.readFileSync(file, 'utf8');

    if (!content.trim()) {
        return {};
    }

    return JSON.parse(content);
}

function writeJson(filename, data) {
    const file = getPath(filename);

    fs.writeFileSync(
        file,
        JSON.stringify(data, null, 2),
        'utf8'
    );
}

module.exports = {
    readJson,
    writeJson
};