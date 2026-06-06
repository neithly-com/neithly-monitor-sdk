const crypto = require('node:crypto');
const { execSync } = require('node:child_process');

const projectId = process.argv[2] || 'cmq2hk8oy0000n8zg7t18f7fw'; // Apollo Web
const id = 'dsn_qa_' + crypto.randomBytes(6).toString('hex');
const plaintext = 'nmk_dev_' + crypto.randomBytes(32).toString('hex');
const keyHash = crypto.createHash('sha256').update(plaintext, 'utf8').digest('hex');

const sql = `INSERT INTO project_dsns (id, project_id, key_hash, label, allowed_origins, created_at) VALUES ('${id}', '${projectId}', '${keyHash}', 'qa-integration', ARRAY['http://localhost:5174']::text[], NOW()) ON CONFLICT (id) DO NOTHING RETURNING id;`;

execSync(`docker exec neithly-monitor-postgres-1 psql -U neithly -d neithly_monitor_dev -c "${sql}"`, { stdio: 'inherit' });
console.log('\nDSN:', plaintext);
console.log('Project:', projectId);
