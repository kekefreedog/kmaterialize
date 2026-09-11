// Air Datepicker declares only extensionless locale modules. Match the explicit
// JavaScript paths required by consumers of our ESM bundle.
declare module 'air-datepicker/locale/en.js' {
  import type { AirDatepickerLocale } from 'air-datepicker';
  const locale: AirDatepickerLocale;
  export default locale;
}

declare module 'air-datepicker/locale/fr.js' {
  import type { AirDatepickerLocale } from 'air-datepicker';
  const locale: AirDatepickerLocale;
  export default locale;
}
