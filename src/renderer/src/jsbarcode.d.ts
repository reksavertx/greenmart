// Deklarasi minimal JsBarcode (module tidak menyertakan tipe resmi).
declare module 'jsbarcode' {
  interface JsBarcodeOptions {
    format?: string;
    displayValue?: boolean;
    height?: number;
    width?: number;
    fontSize?: number;
    margin?: number;
    background?: string;
    lineColor?: string;
  }
  function JsBarcode(element: Element | string, text: string, options?: JsBarcodeOptions): void;
  export default JsBarcode;
}
