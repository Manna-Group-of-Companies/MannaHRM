/* ---------------------------------------------------------------------------
   Where an Employee record keeps its statutory numbers — Aadhaar, PAN, UAN, PF
   and ESIC — under every spelling this group's systems have written.

   Pure, and on its own so that the employee export and the wages register read
   the same fields: two lists of spellings would drift, and the one that missed
   a spelling would call a PF member a non-member without a word.
   --------------------------------------------------------------------------- */

/** The first of several fields that holds anything — PAN lives in either of
    two, depending on which import wrote it. */
export const first = (...fields) => (e) => {
	for (const f of fields) if (e[f] != null && e[f] !== "") return e[f];
	return "";
};

/* Every spelling of a statutory field this group's systems have written. The
   dashboard and install.py say `custom_aadhaar_number`; the bridge's Create
   Employee says `custom_aadhaar_no`; a Factor HR backfill or a hand-made Custom
   Field could say anything else. A column that read only one of them came out
   blank on 24 Sep 2026 for a site that holds the number under another. */
export const AADHAAR = first("custom_aadhaar_number", "custom_aadhaar_no", "custom_aadhar_number", "custom_aadhar_no",
	"aadhaar_number", "aadhaar_no", "custom_aadhaar", "custom_aadhar");
export const PAN = first("custom_pan_no", "pan_number", "custom_pan_number", "custom_pan");
export const UAN = first("custom_uan", "custom_uan_no", "custom_uan_number", "uan_number", "uan_no", "uan");
export const ESIC = first("custom_esic_number", "custom_esic_no", "custom_esi_no", "custom_esi_number",
	"esic_number", "esic_no", "esi_number", "esi_no");
export const PF = first("provident_fund_account", "custom_pf_no", "custom_pf_number", "custom_pf_account",
	"pf_number", "pf_no");
