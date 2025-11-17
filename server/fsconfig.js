import xlsx from 'xlsx';

export async function getFileExcel(request, response) {
    const inputFilePath = process.env.URL_DIR_EGE
    let File = xlsx.readFile(inputFilePath);
    let Content = xlsx.utils.sheet_to_json(File.Sheets[File.SheetNames[0]]);
    response.status(200).json(JSON.parse(JSON.stringify(Content).replace(/, /g, ' ').replace(/-/g, ' ').replace(/"\s+|\s+"/g,'"').replace(/(\s+)(?=[(\w* *]*":)/g, "_")))
}

export async function getLogEnviado(request, response) {
    const inputFilePath = process.env.URL_DIR_LOGS
    const workbook = xlsx.readFile(inputFilePath + '/envios_ok.csv');
    const SheetNames = workbook.SheetNames[0];
    const Sheets = workbook.Sheets[SheetNames];
    const Content = xlsx.utils.sheet_to_json(Sheets);
    response.status(200).json(JSON.parse(JSON.stringify(Content)))
}

export async function getLogError(request, response) {
    const inputFilePath = process.env.URL_DIR_LOGS
    const workbook = xlsx.readFile(inputFilePath + '/envios_error.csv');
    const SheetNames = workbook.SheetNames[0];
    const Sheets = workbook.Sheets[SheetNames];
    const Content = xlsx.utils.sheet_to_json(Sheets);
    response.status(200).json(JSON.parse(JSON.stringify(Content)))
}
