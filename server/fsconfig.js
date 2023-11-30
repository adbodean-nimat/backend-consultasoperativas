const xlsx = require('xlsx');

exports.getFileExcel = async (request, response) => {
    const inputFilePath = '/mnt/prades_fs/ventas/ROWA PLAN CANJE POR SIEMPRE ROWA.xlsx'
    let File = xlsx.readFile(inputFilePath);
    let Content = xlsx.utils.sheet_to_json(File.Sheets[File.SheetNames[0]]);
    response.status(200).json(JSON.parse(JSON.stringify(Content).replace(/, /g, ' ').replace(/-/g, ' ').replace(/"\s+|\s+"/g,'"').replace(/(\s+)(?=[(\w* *]*":)/g, "_")))
}
