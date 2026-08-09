import mongoose from "mongoose";

let memoryServer: any;

export function getMongoCandidates(uri?: string): string[] {
    const raw = [uri, process.env.MONGO_URI, "mongodb://127.0.0.1:27017/persfin"];
    return Array.from(new Set(raw.filter(Boolean))) as string[];
}

/**
 * Connects mongoose to the first reachable candidate URI, falling back to an
 * embedded in-memory Mongo instance if nothing else is reachable. Returns the
 * URI that was actually connected to (callers that need to point other Mongo
 * clients, e.g. the session store, at the same database must use this return
 * value rather than re-reading the original config).
 */
export async function connectToDatabase(uri?: string): Promise<string> {
    const candidates = getMongoCandidates(uri);

    for (const candidate of candidates) {
        try {
            await mongoose.connect(candidate, {
                serverSelectionTimeoutMS: 1500,
                connectTimeoutMS: 1500,
            });
            console.log(`Mongo connected via ${candidate}`);
            return candidate;
        } catch (error) {
            console.warn(`Mongo connection failed for ${candidate}:`, error);
        }
    }

    try {
        const { MongoMemoryServer } = require("mongodb-memory-server");
        memoryServer = await MongoMemoryServer.create();
        const localUri = memoryServer.getUri();
        await mongoose.connect(localUri, {
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 5000,
        });
        console.log(`Mongo connected via embedded local server ${localUri}`);
        return localUri;
    } catch (error) {
        throw new Error(`Unable to connect to Mongo: all candidates and the embedded fallback failed (${error})`);
    }
}
