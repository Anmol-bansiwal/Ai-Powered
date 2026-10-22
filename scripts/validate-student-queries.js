"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const student_query_validation_1 = require("../src/questions/student-query-validation");
const ROOT = (0, node_path_1.join)(__dirname, '..');
function main() {
    const students = JSON.parse((0, node_fs_1.readFileSync)((0, node_path_1.join)(ROOT, 'eval/student-queries.json'), 'utf8'));
    const labels = JSON.parse((0, node_fs_1.readFileSync)((0, node_path_1.join)(ROOT, 'eval/retrieval-labels.json'), 'utf8'));
    const known = (0, student_query_validation_1.knownIdsFromRetrievalLabels)(labels);
    const report = (0, student_query_validation_1.validateStudentQueries)(students, known);
    console.log('=== student-queries validation ===');
    console.log(JSON.stringify(report.counts, null, 2));
    for (const issue of report.errors) {
        console.error(`ERROR [${issue.code}] ${issue.id ?? '-'}: ${issue.message}`);
    }
    for (const issue of report.warnings) {
        console.warn(`WARN  [${issue.code}] ${issue.id ?? '-'}: ${issue.message}`);
    }
    if (!report.ok) {
        process.exitCode = 1;
        console.error('Validation failed.');
        return;
    }
    console.log('Validation passed.');
    if (report.counts.scorableIndependent === 0) {
        console.log('No scorable independent queries yet — collect and label before npm run eval:student.');
    }
}
main();
//# sourceMappingURL=validate-student-queries.js.map