console.log('start');
import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';
const path='C:/Users/it/Downloads/MRPPL & Soorya Salary Sep 2026-Payroll designing.xlsx';
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load(path));
const info=await wb.inspect({kind:'workbook,sheet,table,drawing',maxChars:12000,tableMaxRows:15,tableMaxCols:20});
console.log(info.ndjson);
console.log(JSON.stringify(info));

