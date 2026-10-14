import { FileBlob, SpreadsheetFile } from '@oai/artifact-tool';
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load('C:/Users/it/Downloads/MRPPL & Soorya Salary Sep 2026-Payroll designing.xlsx'));
const sheets=await wb.inspect({kind:'sheet',include:'id,name'});
console.log(sheets.ndjson);
for (const item of wb.worksheets.items) {
  console.log(item.name, JSON.stringify(item.getRange('B1:C4').values));
}
