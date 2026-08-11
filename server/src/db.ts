import mongoose from "mongoose";

let memoryServer: any;

function isProduction(): boolean {
    return process.env.NODE_ENV === "production";
}

export function getMongoCandidates(uri?: string): string[] {
    // The local-Mongo candidate only makes sense on a dev machine — a
    // production container has no local Mongo to fall back to, so trying it
    // just wastes a connection timeout on every startup.
    const raw = [uri, process.env.MONGO_URI, ...(isProduction() ? [] : ["mongodb://127.0.0.1:27017/persfin"])];
    return Array.from(new Set(raw.filter(Boolean))) as string[];
}

/**
 * Connects mongoose to the first reachable candidate URI. Returns the URI
 * that was actually connected to (callers that need to point other Mongo
 * clients, e.g. the session store, at the same database must use this return
 * value rather than re-reading the original config).
 *
 * In development, falls back to an embedded in-memory Mongo instance if
 * nothing else is reachable — convenient when neither a local nor an Atlas
 * Mongo is reachable from the dev machine. That fallback is deliberately
 * disabled in production: a real connection failure there throws instead, so
 * a misconfigured MONGO_URI fails the deploy loudly rather than silently
 * running the live app on data that vanishes on every restart.
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

    if (isProduction()) {
        throw new Error(
            `Unable to connect to Mongo in production: all candidates failed (${candidates.join(", ") || "none configured"}). ` +
            `Check the MONGO_URI environment variable and Atlas network access — the embedded in-memory fallback is disabled in production.`
        );
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
