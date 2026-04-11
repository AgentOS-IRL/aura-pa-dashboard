import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');
const DEFAULT_DB_PATH = path.join(DATA_DIR, 'transcripts.db');
const transcriptDbPath = process.env.TRANSCRIPT_DB_PATH
  ? path.resolve(process.env.TRANSCRIPT_DB_PATH)
  : DEFAULT_DB_PATH;

fs.mkdirSync(path.dirname(transcriptDbPath), { recursive: true });

const transcriptDatabase = new Database(transcriptDbPath, {
  readonly: false
});

transcriptDatabase.pragma('journal_mode = WAL');
transcriptDatabase.pragma('foreign_keys = ON');
transcriptDatabase.pragma('busy_timeout = 5000');

let closed = false;

export function getTranscriptDatabase(): Database.Database {
  return transcriptDatabase;
}

export function closeTranscriptDatabase(): void {
  if (closed) {
    return;
  }
  closed = true;
  transcriptDatabase.close();
}

process.once('exit', () => {
  closeTranscriptDatabase();
});

export { transcriptDbPath };
