/* ---------------------------------------------------------------------------
   The masters the seed writes, and the pieces it builds people out of.

   Everything here is invented. It is shaped like Manna's — one company, a
   handful of plants' worth of departments, shifts that start at six and two —
   but no name, number or figure in this file came off a real record, and none
   should. A seed that carries real people is a seed somebody eventually commits
   to a public repository.
   --------------------------------------------------------------------------- */

export const COMPANY = {
	name: "Manna Rubber Industries",
	abbr: "MRI",
	default_holiday_list: "India Holidays 2026",
};

export const DEPARTMENTS: Array<[string, 0 | 1]> = [
	["Production", 0],
	["Quality Assurance", 0],
	["Maintenance", 0],
	["Stores", 0],
	["Dispatch", 0],
	["Human Resources", 0],
	["Accounts", 0],
	["Sales", 0],
	/* One disabled, because the Status column behind View Category has to have
	   something to show. A master list where every row says the same thing does
	   not test the screen that reads it. */
	["Tooling (closed)", 1],
];

export const DESIGNATIONS = [
	"Machine Operator", "Senior Operator", "Shift Supervisor", "Line Inspector",
	"QA Engineer", "Maintenance Fitter", "Store Keeper", "Dispatch Clerk",
	"HR Executive", "Accounts Executive", "Sales Executive", "Plant Manager",
];

export const GRADES = ["G1", "G2", "G3", "G4", "M1"];
export const BRANCHES = ["Ambattur Plant", "Sriperumbudur Plant", "Head Office"];
export const EMPLOYMENT_TYPES = ["Full-time", "Contract", "Apprentice"];

/** Three shifts, and the general one most people are on. Times are `HH:MM:SS`
    strings — a shift starts at six in the morning wherever the reader is. */
export const SHIFT_TYPES: Array<{ name: string; start_time: string; end_time: string }> = [
	{ name: "General", start_time: "09:00:00", end_time: "18:00:00" },
	{ name: "Shift A", start_time: "06:00:00", end_time: "14:00:00" },
	{ name: "Shift B", start_time: "14:00:00", end_time: "22:00:00" },
	/* The one that crosses midnight, which is the case every attendance rule in
	   this system either handles or quietly gets wrong. */
	{ name: "Shift C", start_time: "22:00:00", end_time: "06:00:00" },
];

export const LEAVE_TYPES: Array<{ name: string; max_leaves_allowed: number; is_lwp: 0 | 1 }> = [
	{ name: "Casual Leave", max_leaves_allowed: 12, is_lwp: 0 },
	{ name: "Sick Leave", max_leaves_allowed: 12, is_lwp: 0 },
	{ name: "Earned Leave", max_leaves_allowed: 18, is_lwp: 0 },
	{ name: "Compensatory Off", max_leaves_allowed: 0, is_lwp: 0 },
	{ name: "Leave Without Pay", max_leaves_allowed: 0, is_lwp: 1 },
	{ name: "Maternity Leave", max_leaves_allowed: 182, is_lwp: 0 },
];

export const LETTER_TYPES: Array<{ name: string; category: string; is_active: 0 | 1; fields_used: string }> = [
	{ name: "Offer Letter", category: "Onboarding", is_active: 1, fields_used: "employee_name,designation,date_of_joining,ctc" },
	{ name: "Appointment Letter", category: "Onboarding", is_active: 1, fields_used: "employee_name,designation,department,date_of_joining" },
	{ name: "Confirmation Letter", category: "Confirmation", is_active: 1, fields_used: "employee_name,final_confirmation_date,designation" },
	{ name: "Experience Certificate", category: "Exit", is_active: 1, fields_used: "employee_name,date_of_joining,relieving_date,designation" },
	{ name: "Relieving Letter", category: "Exit", is_active: 1, fields_used: "employee_name,relieving_date" },
	/* Retired rather than deleted. The client filters on `is_active !== 0`, and a
	   list where nothing is ever inactive never exercises that filter. */
	{ name: "Warning Letter (2019 format)", category: "Discipline", is_active: 0, fields_used: "employee_name" },
];

/** What somebody types into the Remarks column of a letter, on the minority of
    letters anybody types into it at all. Short and clerical on purpose: the
    column is a note to the next person in the file, not a record of anything. */
export const LETTER_REMARKS: readonly string[] = [
	"Handed over in person",
	"Emailed to personal address",
	"Reissued — earlier copy misplaced",
	"Signed copy on file",
	"Collected by courier",
];

/** Earnings and deductions, with the abbreviation hrms would give each and
    whether it is employer cost carried inside the CTC. */
export const SALARY_COMPONENTS: Array<{
	name: string;
	abbr: string;
	type: "Earning" | "Deduction";
	ctc: 0 | 1;
}> = [
	{ name: "Basic", abbr: "B", type: "Earning", ctc: 0 },
	{ name: "House Rent Allowance", abbr: "HRA", type: "Earning", ctc: 0 },
	{ name: "Conveyance Allowance", abbr: "CA", type: "Earning", ctc: 0 },
	{ name: "Special Allowance", abbr: "SA", type: "Earning", ctc: 0 },
	{ name: "Shift Allowance", abbr: "SHA", type: "Earning", ctc: 0 },
	{ name: "Provident Fund", abbr: "PF", type: "Deduction", ctc: 0 },
	{ name: "Professional Tax", abbr: "PT", type: "Deduction", ctc: 0 },
	{ name: "ESIC", abbr: "ESIC", type: "Deduction", ctc: 0 },
	/* Employer cost. Without `do_not_include_in_total` this is paid to the
	   employee as salary rather than carried in the CTC. */
	{ name: "Employer PF Contribution", abbr: "EPF", type: "Earning", ctc: 1 },
];

/* Names, split so the generator can pair them. Ordinary Tamil and north Indian
   given names and surnames, chosen to be unremarkable — the point is a list
   that reads like a real muster roll without being one. */
export const FIRST_NAMES = [
	"Anand", "Bhavani", "Chandran", "Deepa", "Elango", "Farida", "Ganesh", "Hema",
	"Irfan", "Janaki", "Karthik", "Lakshmi", "Manikandan", "Nithya", "Omprakash",
	"Priya", "Quadir", "Rajesh", "Saravanan", "Thamarai", "Uma", "Vignesh",
	"Wasim", "Yamuna", "Zahir", "Arun", "Bhuvana", "Dinesh", "Gayathri", "Harish",
	"Iniya", "Jagan", "Kavitha", "Muthu", "Nandini", "Prakash", "Ramya", "Selvam",
	"Tamilarasi", "Vinoth",
];

export const LAST_NAMES = [
	"Subramanian", "Krishnan", "Natarajan", "Venkatesan", "Ramachandran", "Iyer",
	"Pillai", "Chettiar", "Mudaliar", "Gounder", "Reddy", "Sharma", "Verma",
	"Nair", "Menon", "Balan", "Kumar", "Raj", "Devi", "Selvaraj",
];

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];
export const MARITAL = ["Single", "Married"];
export const GENDERS = ["Male", "Female"];

/** Asset categories and what a piece of each is called. */
export const ASSET_KINDS: Array<[string, string]> = [
	["IT Equipment", "Laptop"],
	["IT Equipment", "Desktop"],
	["Communication", "Mobile Handset"],
	["Safety", "Safety Shoes"],
	["Safety", "Helmet"],
	["Tools", "Torque Wrench"],
	["Furniture", "Office Chair"],
];

/** Who an asset was bought from — Factor HR's Vendor Name box, ERPNext's
    `supplier`. Plausible Chennai-area trade names rather than real ones: this
    is a development database and a real supplier's name in it is a real
    supplier's name in every screenshot taken of it. */
export const ASSET_VENDORS: readonly string[] = [
	"Sakthi Systems",
	"Vel Infotech",
	"Chola Office Supplies",
	"Anand Safety Traders",
	"Meenakshi Tools & Hardware",
	"RK Communications",
];

/** The 2026 holiday list, with the two weekly offs left to the generator.
    Dates are calendar dates, so they are strings and not instants. */
export const HOLIDAYS_2026: Array<[string, string]> = [
	["2026-01-01", "New Year's Day"],
	["2026-01-14", "Pongal"],
	["2026-01-15", "Thiruvalluvar Day"],
	["2026-01-26", "Republic Day"],
	["2026-03-19", "Telugu New Year"],
	["2026-04-14", "Tamil New Year"],
	["2026-05-01", "May Day"],
	["2026-08-15", "Independence Day"],
	["2026-09-14", "Vinayaka Chaturthi"],
	["2026-10-02", "Gandhi Jayanti"],
	["2026-10-20", "Ayudha Pooja"],
	["2026-11-08", "Deepavali"],
	["2026-12-25", "Christmas"],
];
