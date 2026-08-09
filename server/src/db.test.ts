import test from 'node:test';
import assert from 'node:assert/strict';
import { getMongoCandidates } from './db';

test('includes the local Mongo fallback for remote atlas URIs', () => {
    const candidates = getMongoCandidates('mongodb+srv://user:pass@cluster0.example.mongodb.net/persfin');

    assert.ok(candidates.includes('mongodb+srv://user:pass@cluster0.example.mongodb.net/persfin'));
    assert.ok(candidates.includes('mongodb://127.0.0.1:27017/persfin'));
});
