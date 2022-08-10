var config = require('./dbconfig.js');
const sql = require('mssql');

async function getControl() {
    try {
      let  pool = await  sql.connect(config);
      let  info = await  pool.request().query("SELECT FORMAT(CAST(dbo.CCOB_CLIE.CLIE_FECHA_ALTA as DATE), 'yyyy-MM-dd') AS [CLIE_FECHA_ALTA] ,dbo.SEGU_AUDI.AUDI_USUARIO ,dbo.SEGU_USUA.USUA_NOMBRE ,dbo.SIST_VEND.VEND_NOMBRE ,dbo.CCOB_CLIE.CLIE_CLIENTE ,dbo.CCOB_CLIE.CLIE_NOMBRE ,dbo.CCOB_CLIE.CLIE_EMAIL ,dbo.CCOB_CLC5.CLC5_NOMBRE ,dbo.CCOB_DCLI.DCLI_DOMICILIO ,dbo.CCOB_DCLI.DCLI_LOCALIDAD ,dbo.CCOB_DCLI.DCLI_COD_LOCALIDAD ,dbo.CCOB_DCLI.DCLI_COD_POSTAL ,dbo.CCOB_DCLI.DCLI_PROVINCIA ,dbo.CCOB_CLIE.CLIE_CONDICION_IVA ,dbo.CCOB_CLIE.CLIE_CUIT ,dbo.CCOB_CLIE.CLIE_ING_BRUTOS ,dbo.CCOB_CLIE.CLIE_COND_PAGO ,dbo.CCOB_CLIE.CLIE_COBRADOR ,dbo.CCOB_CLPF.CLPF_FECHA_NACIM ,dbo.CCOB_CLPF.CLPF_NACIONALIDAD ,dbo.CCOB_CLPF.CLPF_SEXO FROM(((dbo.SEGU_AUDI WITH (NOLOCK) INNER JOIN dbo.CCOB_AUCL WITH (NOLOCK) ON dbo.SEGU_AUDI.AUDI_AUDITOR = dbo.CCOB_AUCL.AUCL_AUDITOR) INNER JOIN dbo.SEGU_USUA WITH (NOLOCK) ON dbo.SEGU_AUDI.AUDI_USUARIO = dbo.SEGU_USUA.USUA_USUARIO) INNER JOIN (((dbo.CCOB_CLIE WITH (NOLOCK) INNER JOIN dbo.CCOB_DCLI WITH (NOLOCK) ON dbo.CCOB_CLIE.CLIE_CLIENTE = dbo.CCOB_DCLI.DCLI_CLIENTE) LEFT JOIN dbo.CCOB_CLPF WITH (NOLOCK) ON dbo.CCOB_CLIE.CLIE_CLIENTE = dbo.CCOB_CLPF.CLPF_CLIENTE) INNER JOIN dbo.CCOB_CLC5 WITH (NOLOCK) ON dbo.CCOB_CLIE.CLIE_CLASIF_5 = dbo.CCOB_CLC5.CLC5_CLASIF_5) ON dbo.CCOB_AUCL.AUCL_CLIENTE = dbo.CCOB_CLIE.CLIE_CLIENTE) INNER JOIN (dbo.CCOB_VECL WITH (NOLOCK) INNER JOIN dbo.SIST_VEND WITH (NOLOCK) ON dbo.CCOB_VECL.VECL_VENDEDOR = dbo.SIST_VEND.VEND_VENDEDOR) ON dbo.CCOB_CLIE.CLIE_CLIENTE = dbo.CCOB_VECL.VECL_CLIENTE WHERE (((dbo.SEGU_AUDI.AUDI_INSERTA)=1))");
      return  info.recordsets;
    }
    catch (error) {
      console.log(error);
    }
  }

  async function getListaClientes(){
    try {
      let pool = await sql.connect(config);
      let lista = await pool.request().query("SELECT FORMAT(CAST(dbo.CCOB_CLIE.CLIE_FECHA_ALTA as DATE), 'yyyy-MM-dd') AS [Fecha_alta_cliente] ,dbo.CCOB_CLIE.CLIE_CLIENTE AS [Nro_cliente] ,dbo.CCOB_CLIE.CLIE_NOMBRE AS [Nombre_cliente] ,dbo.CCOB_DCLI.DCLI_RENGLON AS [Cod_domic] ,dbo.CCOB_DCLI.DCLI_FAX AS [Fax_celular] ,IIf(ISNULL(dbo.CCOB_DCLI.DCLI_FAX,0)='0','',IIf(Len(dbo.CCOB_DCLI.DCLI_FAX)=10,'','Completar, revisar «Fax(celular)»')) AS Verificación ,dbo.CCOB_DCLI.DCLI_TELEFONO AS Teléfono ,dbo.CCOB_DCLI.DCLI_OBSERVACION AS [Observ_domicilio] ,dbo.CCOB_CLIE.CLIE_COBRADOR AS Cobrador ,dbo.SIST_VEND.VEND_NOMBRE AS Vendedor FROM ((dbo.CCOB_CLIE WITH (NOLOCK) INNER JOIN dbo.CCOB_DCLI WITH (NOLOCK) ON dbo.CCOB_CLIE.CLIE_CLIENTE = dbo.CCOB_DCLI.DCLI_CLIENTE) INNER JOIN dbo.CCOB_VECL WITH (NOLOCK) ON dbo.CCOB_CLIE.CLIE_CLIENTE = dbo.CCOB_VECL.VECL_CLIENTE) INNER JOIN dbo.SIST_VEND WITH (NOLOCK) ON dbo.CCOB_VECL.VECL_VENDEDOR = dbo.SIST_VEND.VEND_VENDEDOR");
      return lista.recordsets;
    }
    catch (error) {
      console.log(error);
    }
  }

  async function getOrder(fechaAlta) {
    try {
      let  pool = await  sql.connect(config);
      let  product = await  pool.request()
      .input('input_parameter', sql.Date, fechaAlta)
      .query("SELECT FORMAT(CAST(dbo.CCOB_CLIE.CLIE_FECHA_ALTA as DATE), 'dd-MM-yyyy') AS [CLIE_FECHA_ALTA] ,dbo.SEGU_AUDI.AUDI_USUARIO ,dbo.SEGU_USUA.USUA_NOMBRE ,dbo.CCOB_VECL.VECL_VENDEDOR ,dbo.SIST_VEND.VEND_NOMBRE ,dbo.CCOB_CLIE.CLIE_CLIENTE ,dbo.CCOB_CLIE.CLIE_NOMBRE ,dbo.CCOB_CLIE.CLIE_EMAIL ,dbo.CCOB_CLC5.CLC5_CLASIF_5 ,dbo.CCOB_DCLI.DCLI_DOMICILIO ,dbo.CCOB_DCLI.DCLI_LOCALIDAD ,dbo.CCOB_DCLI.DCLI_COD_LOCALIDAD ,dbo.CCOB_DCLI.DCLI_MUNICIPIO ,dbo.CCOB_DCLI.DCLI_COD_POSTAL ,dbo.CCOB_DCLI.DCLI_PROVINCIA ,dbo.CCOB_CLIE.CLIE_CONDICION_IVA ,dbo.CCOB_CLIE.CLIE_CUIT FROM ((dbo.SEGU_AUDI INNER JOIN ((((dbo.CCOB_CLIE INNER JOIN dbo.CCOB_DCLI ON dbo.CCOB_CLIE.CLIE_CLIENTE = dbo.CCOB_DCLI.DCLI_CLIENTE) INNER JOIN dbo.CCOB_CLPF ON dbo.CCOB_CLIE.CLIE_CLIENTE = dbo.CCOB_CLPF.CLPF_CLIENTE) INNER JOIN dbo.CCOB_CLC5 ON dbo.CCOB_CLIE.CLIE_CLASIF_5 = dbo.CCOB_CLC5.CLC5_CLASIF_5) INNER JOIN dbo.CCOB_AUCL ON dbo.CCOB_CLIE.CLIE_CLIENTE = dbo.CCOB_AUCL.AUCL_CLIENTE) ON dbo.SEGU_AUDI.AUDI_AUDITOR = dbo.CCOB_AUCL.AUCL_AUDITOR) INNER JOIN dbo.SEGU_USUA ON dbo.SEGU_AUDI.AUDI_USUARIO = dbo.SEGU_USUA.USUA_USUARIO) INNER JOIN (dbo.CCOB_VECL INNER JOIN dbo.SIST_VEND ON dbo.CCOB_VECL.VECL_VENDEDOR = dbo.SIST_VEND.VEND_VENDEDOR) ON dbo.CCOB_CLIE.CLIE_CLIENTE = dbo.CCOB_VECL.VECL_CLIENTE WHERE (((dbo.SEGU_AUDI.AUDI_INSERTA)=1)) AND CAST(dbo.CCOB_CLIE.CLIE_FECHA_ALTA as DATE) >= FORMAT(CAST(@input_parameter as date), 'dd-MM-yyyy')");
      return  product.recordsets;
    }
    catch (error) {
      console.log(error);
    }
  }

  async function addControl(control) {
    try {
      let  pool = await  sql.connect(config);
      let  insertControl = await  pool.request()
      .input('CLIE_FECHA_ALTA', sql.Date(), control.CLIE_FECHA_ALTA)
      .input('AUDI_USUARIO', sql.VarChar(8), control.AUDI_USUARIO)
      .input('USUA_NOMBRE', sql.VarChar(30), control.USUA_NOMBRE)
      .input('VEND_NOMBRE', sql.VarChar(30), control.VEND_NOMBRE)
      .input('CLIE_CLIENTE', sql.VarChar(30), control.CLIE_CLIE)
      .input('CLIE_NOMBRE', sql.VarChar(30), control.CLIE_NOMBRE)
      .input('CLIE_EMAIL', sql.VarChar(250), control.CLIE_EMAIL)
      .input('CLC5_CLASIF_5', sql.VarChar(4), control.CLC5_NOMBRE)
      .input('DCLI_DOMICILIO', sql.VarChar(60), control.DCLI_DOMICILIO)
      .input('DCLI_LOCALIDAD', sql.VarChar(50), control.DCLI_LOCALIDAD)
      .input('DCLI_COD_LOCALIDAD', sql.VarChar(5), control.DCLI_COD_LOCALIDAD)
      .input('DCLI_COD_POSTAL', sql.VarChar(10), control.DCLI_COD_POSTAL)
      .input('DCLI_PROVINCIA', sql.VarChar(3), control.DCLI_PROVINCIA)
      .input('CLIE_CONDICION_IVA', sql.VarChar(4), control.CLIE_CONDICION_IVA)
      .input('CLIE_CUIT ', sql.VarChar(15), control.CLIE_CUIT )
      .execute('InsertControl');
      return  insertControl.recordsets;
    }
    catch (err) {
      console.log(err);
    }
  }

  module.exports = {
    getControl: getControl,
    getOrder: getOrder,
    addControl: addControl,
    getListaClientes: getListaClientes
  }