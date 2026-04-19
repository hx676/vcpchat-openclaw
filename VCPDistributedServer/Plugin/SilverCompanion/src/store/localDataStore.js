const path = require('path');
const fs = require('fs-extra');

const { DATA_FILES } = require('../types/constants');

class LocalDataStore {
    constructor(options) {
        this.dataDir = options.dataDir;
        this.defaultFactory = options.defaultFactory;
    }

    resolvePath(key) {
        const fileName = DATA_FILES[key];
        if (!fileName) {
            throw new Error(`Unknown data file key: ${key}`);
        }
        return path.join(this.dataDir, fileName);
    }

    async ensureDataFiles() {
        await fs.ensureDir(this.dataDir);
        const defaults = this.defaultFactory();

        for (const [key, fileName] of Object.entries(DATA_FILES)) {
            const filePath = path.join(this.dataDir, fileName);
            if (!(await fs.pathExists(filePath))) {
                await fs.writeJson(filePath, defaults[key], { spaces: 2 });
            }
        }
    }

    async readFile(key) {
        await this.ensureDataFiles();
        return fs.readJson(this.resolvePath(key));
    }

    async writeFile(key, value) {
        await this.ensureDataFiles();
        await fs.writeJson(this.resolvePath(key), value, { spaces: 2 });
        return value;
    }

    async updateFile(key, updater) {
        const currentValue = await this.readFile(key);
        const nextValue = await updater(currentValue);
        await this.writeFile(key, nextValue);
        return nextValue;
    }

    async readAll() {
        await this.ensureDataFiles();
        const entries = await Promise.all(
            Object.keys(DATA_FILES).map(async (key) => [key, await this.readFile(key)])
        );
        return Object.fromEntries(entries);
    }

    async reset() {
        await fs.ensureDir(this.dataDir);
        const defaults = this.defaultFactory();
        await Promise.all(
            Object.keys(DATA_FILES).map((key) => this.writeFile(key, defaults[key]))
        );
        return defaults;
    }
}

module.exports = LocalDataStore;
