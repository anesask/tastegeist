/**
 * Operator details for the legal pages, in one place.
 * Fill in every field marked TODO before going live: an Impressum (§ 5 DDG) needs a real name,
 * a postal address and a fast way to get in touch. The texts are a draft; have them reviewed.
 */
export const OPERATOR = {
  name: 'Anes Mulalic',
  street: 'Am Rinkenbuhl 3',
  city: '64807 Dieburg',
  country: 'Germany',
  email: 'anesdevtoday@gmail.com',
  website: 'anesmulalic.com',
  phone: '' as string, // optional; email plus a contact form or phone is required
  vatId: '' as string, // none: operated by a private person
  host: 'netcup GmbH, Karlsruhe, Germany', // virtual server (privacy policy, section 1)
}

export const LEGAL_UPDATED = '30 October 2026'

/** True once every TODO above is replaced; the pages show a visible warning until then. */
export const LEGAL_COMPLETE = !Object.values(OPERATOR).some((v) => typeof v === 'string' && v.startsWith('TODO'))
