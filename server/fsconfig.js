const xlsx = require('xlsx');

exports.getFileExcel = async (request, response) => {
    const inputFilePath = 'file://192.168.0.46/prades_fs/Departamento Ventas/VENTAS TABLEROS y CONSULTAS RAPIDAS/EGE/ROWA PLAN CANJE POR SIEMPRE ROWA.xlsx'
    let File = xlsx.readFile(new URL(inputFilePath));
    let Content = xlsx.utils.sheet_to_json(File.Sheets[File.SheetNames[0]]);
    response.status(200).json(JSON.parse(JSON.stringify(Content).replace(/, /g, ' ').replace(/-/g, ' ').replace(/"\s+|\s+"/g,'"').replace(/(\s+)(?=[(\w* *]*":)/g, "_")))
}