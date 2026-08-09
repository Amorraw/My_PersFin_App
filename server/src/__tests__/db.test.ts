import { getMongoCandidates } from '../db';

test('includes the local Mongo fallback for remote atlas URIs', () => {
    const candidates = getMongoCandidates('mongodb+srv://user:pass@cluster0.example.mongodb.net/persfin');

    expect(candidates).toContain('mongodb+srv://user:pass@cluster0.example.mongodb.net/persfin');
    expect(candidates).toContain('mongodb://127.0.0.1:27017/persfin');
});
