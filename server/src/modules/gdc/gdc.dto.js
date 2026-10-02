/**
 * @typedef {{period: string, productionTon: number|null, salesRemittancesTon: number|null, totalConsumptionTon: number|null}} MonthlyConsumption
 * @typedef {{mainWarehouse: number|null, otherWarehouses: number|null, total: number|null}} WarehouseAmounts
 * @typedef {WarehouseAmounts & {referenceCode: string|null}} ReferenceStock
 * @typedef {WarehouseAmounts & {days: number|null, daysStatus: 'OK'|'NO_CONSUMPTION'|'INVALID_CONSUMPTION_FACTOR'|'INVALID_STOCK_FACTOR'}} TonStock
 * @typedef {{code: string, block: string, count?: number, articleCode?: string, scope?: string, period?: string|null}} GdcWarning
 * @typedef {{referenceCodeKg: string, factorHomogeneousStock: number|null, kgPerMeterOrHl: number|null, notes: string|null, status: 'OK'|'CODE_NOT_FOUND'|'INVALID_FACTOR'|'MULTIPLE_FACTORS'}} ReferenceData
 * @typedef {{classifier4: string|null, classifier4Name: string|null, classifier5: string, name: string, consumption: MonthlyConsumption[], pendingSalesOrderTon: number|null, stock: {ton: TonStock, units13m: ReferenceStock, units1050: ReferenceStock, unitsHl: ReferenceStock}, purchaseOrders: {pendingTon: number|null, units13m: number, units1050: number, unitsHl: number}, data: ReferenceData, warnings: GdcWarning[]}} GdcFamily
 * @typedef {{months: number, rotationDays: number, mainWarehouse: number, purchaseOrderSupplier: number|null, dateFrom: string, dateToExclusive: string, rotationDateFrom: string, rotationDateToExclusive: string}} CalculationParameters
 * @typedef {{parameters: CalculationParameters, periods: string[], families: GdcFamily[], warnings: GdcWarning[]}} GdcResponse
 */
export {};
