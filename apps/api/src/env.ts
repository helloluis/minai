import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../../.env') });       // repo root
dotenv.config({ path: join(__dirname, '../.env') });             // apps/api (prod: dist/../)
dotenv.config({ path: join(__dirname, '../../../.env.local') }); // repo root override
dotenv.config({ path: join(__dirname, '../.env.local') });       // apps/api override
