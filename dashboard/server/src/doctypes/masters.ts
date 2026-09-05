import { model, type Model } from "mongoose";
import { childSchema, docSchema, type DocBase } from "./base.js";

/* ---------------------------------------------------------------------------
   The masters — the small lists everything else links to.

   All of these are *prompt-named*: the document's `name` is the thing itself.
   A department called Production is `name: "Production"`, which is why the
   client can put `department` on an Employee and have it read as a label with
   no join. It also means renaming one is a migration, not an edit, and that is
   true on the live site too.
   --------------------------------------------------------------------------- */

/* ------------------------------------------------------------------ Company */

export interface Company extends DocBase {
	abbr?: string;
	default_holiday_list?: string;
}

export const CompanyModel: Model<Company> = model<Company>(
	"Company",
	docSchema<Company>({
		abbr: String,
		default_holiday_list: String,
		default_currency: { type: String, default: "INR" },
		country: { type: String, default: "India" },
	}),
	"companies",
);

/* --------------------------------------------------------------- Department */

export interface Department extends DocBase {
	department_name?: string;
	company?: string;
	disabled?: number;
}

export const DepartmentModel: Model<Department> = model<Department>(
	"Department",
	docSchema<Department>({
		department_name: String,
		company: String,
		/* The Status column behind View Category. Department is the only one of
		   the three category masters that carries such a field at all — the client
		   asks for it with a fallback for exactly that reason, and Designation
		   below deliberately does not have one. */
		disabled: { type: Number, enum: [0, 1], default: 0 },
		parent_department: String,
	}),
	"departments",
);

/* -------------------------------------------------------------- Designation */

export interface Designation extends DocBase {
	designation_name?: string;
}

export const DesignationModel: Model<Designation> = model<Designation>(
	"Designation",
	docSchema<Designation>({ designation_name: String, description: String }),
	"designations",
);

/* ------------------------------------------------------------- Holiday List */

const holiday = childSchema({
	holiday_date: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
	description: String,
	weekly_off: { type: Number, enum: [0, 1], default: 0 },
});

export interface HolidayList extends DocBase {
	holiday_list_name?: string;
	from_date?: string;
	to_date?: string;
	holidays?: unknown[];
}

export const HolidayListModel: Model<HolidayList> = model<HolidayList>(
	"HolidayList",
	docSchema<HolidayList>({
		holiday_list_name: String,
		from_date: String,
		to_date: String,
		weekly_off: String,
		/* The dates are a child table, which is why the client fetches holiday
		   lists one document at a time rather than in the list read — see
		   `loadHolidayDates`. A list call cannot reach into this array. */
		holidays: { type: [holiday], default: [] },
	}),
	"holiday_lists",
);

/* ---------------------------------------------------------------- LeaveType */

export interface LeaveType extends DocBase {
	leave_type_name?: string;
	max_leaves_allowed?: number;
}

export const LeaveTypeModel: Model<LeaveType> = model<LeaveType>(
	"LeaveType",
	docSchema<LeaveType>({
		leave_type_name: String,
		max_leaves_allowed: { type: Number, default: 0 },
		is_lwp: { type: Number, enum: [0, 1], default: 0 },
		is_carry_forward: { type: Number, enum: [0, 1], default: 0 },
		include_holiday: { type: Number, enum: [0, 1], default: 0 },
	}),
	"leave_types",
);

/* ---------------------------------------------------------------- ShiftType */

export interface ShiftType extends DocBase {
	start_time?: string;
	end_time?: string;
}

export const ShiftTypeModel: Model<ShiftType> = model<ShiftType>(
	"ShiftType",
	docSchema<ShiftType>({
		/* `HH:MM:SS`, not a Date. A shift starts at nine in the morning wherever
		   the reader is; an instant would move it. */
		start_time: String,
		end_time: String,
		holiday_list: String,
		enable_auto_attendance: { type: Number, enum: [0, 1], default: 0 },
		begin_check_in_before_shift_start_time: { type: Number, default: 60 },
		allow_check_out_after_shift_end_time: { type: Number, default: 60 },
		late_entry_grace_period: { type: Number, default: 0 },
		early_exit_grace_period: { type: Number, default: 0 },
	}),
	"shift_types",
);

/* --------------------------------------------------------------- LetterType */

export interface LetterType extends DocBase {
	category?: string;
	is_active?: number;
	fields_used?: string;
}

export const LetterTypeModel: Model<LetterType> = model<LetterType>(
	"LetterType",
	docSchema<LetterType>({
		category: String,
		/* The client filters on `is_active !== 0`, so an inactive type is 0 and a
		   type that has never been touched is 1. */
		is_active: { type: Number, enum: [0, 1], default: 1 },
		/* A comma-separated list of the merge fields the template names. Text
		   rather than an array because that is how the client reads it. */
		fields_used: String,
		body: String,
	}),
	"letter_types",
);

/* ---------------------------------------------------------- SalaryComponent */

export interface SalaryComponent extends DocBase {
	salary_component?: string;
	salary_component_abbr?: string;
	type?: "Earning" | "Deduction";
	do_not_include_in_total?: number;
}

export const SalaryComponentModel: Model<SalaryComponent> = model<SalaryComponent>(
	"SalaryComponent",
	docSchema<SalaryComponent>({
		salary_component: String,
		salary_component_abbr: String,
		/* Earning or Deduction, and nothing else. The client refuses to reuse a
		   component whose type disagrees with the row being written — see
		   saveRevision — because an amount on the wrong half of a structure is a
		   wrong payslip that nothing reports as an error. */
		type: { type: String, enum: ["Earning", "Deduction"], required: true },
		/* Employer cost carried inside the CTC. Without it an employer's PF
		   contribution is paid to the employee as salary. */
		do_not_include_in_total: { type: Number, enum: [0, 1], default: 0 },
		amount_based_on_formula: { type: Number, enum: [0, 1], default: 0 },
		formula: String,
	}),
	"salary_components",
);

/* ------------------------------------------------------------ AssetCategory */

/* The master behind Assets Details' Asset Type box, and behind Factor HR's
   "Add Asset Types" dialog that opens off it.

   Prompt-named like every master here, which is the whole of why that dialog
   can add a type and delete an unused one but cannot rename one: the category's
   `name` *is* the category, every `Asset` points at it by that string, and
   changing it means rewriting all of them. Frappe calls that `rename_doc` and
   gives it its own machinery for exactly this reason. See the note at the top
   of this file.

   **Their dialog has a second column and ERPNext has nothing for it.** "Hide
   out of stock assets" is a display rule about a stock level, and an Asset is
   one capitalised thing with no on-hand quantity — the same finding the Qty On
   Hand box on the form behind it produces. It is drawn in the dialog and dead,
   rather than left off. */

export interface AssetCategory extends DocBase {
	asset_category_name?: string;
}

export const AssetCategoryModel: Model<AssetCategory> = model<AssetCategory>(
	"AssetCategory",
	docSchema<AssetCategory>({
		/* Carried beside `name` and equal to it, the way ERPNext's own does. It
		   is what a create supplies and what the rename this API refuses would
		   have to change. */
		asset_category_name: { type: String, required: true },
	}),
	"asset_categories",
);
