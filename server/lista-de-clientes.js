class  ListadeClientes{
    constructor(Fecha_alta_cliente,Nro_cliente,Nombre_cliente,Cod_domic,Fax_celular,Verificación,Teléfono,Observ_domicilio,Cobrador,Vendedor){
      this.Fecha_alta_cliente = Fecha_alta_cliente;
      this.Nro_cliente = Nro_cliente;
      this.Nombre_cliente = Nombre_cliente;
      this.Cod_domic = Cod_domic;
      this.Fax_celular = Fax_celular;
      this.Verificación = Verificación;
      this.Teléfono = Teléfono;
      this.Observ_domicilio = Observ_domicilio;
      this.Cobrador = Cobrador;
      this.Vendedor = Vendedor;
    }
  }
  
  module.exports = ListadeClientes;