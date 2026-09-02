/* The shapes the site actually returns, as JSDoc typedefs.

   Nothing here exists at runtime — this file is documentation an editor happens
   to be able to read. It is kept because the *optionality* is the finding: the
   proxy asks for a field list, and a field a site does not have comes back
   absent rather than null. A screen that assumes `department` is present is a
   screen that renders "undefined" for the eleven people who have none. */

/**
 * A module's coverage in this build.
 * @typedef {"live" | "part" | "none" | "skip"} Cov
 */

/**
 * A row's state on a field-list panel. See FSTATE in data/approvals.js.
 * @typedef {"live" | "stock" | "build"} FieldState
 */

/**
 * @typedef {Object} Employee
 * @property {string} name
 * @property {string} [employee_name]
 * @property {string} [employee_number]
 * @property {string} [company]
 * @property {string} [department]
 * @property {string} [designation]
 * @property {string} [attendance_device_id]
 * @property {string} [reports_to]
 * @property {string} [date_of_joining]
 * @property {string} [relieving_date]
 * @property {string} [status]
 * @property {string} [default_shift]
 * @property {string} [salutation]
 * @property {string} [grade]
 * @property {string} [branch]
 * @property {string} [employment_type]
 * @property {string} [holiday_list]
 * @property {number} [ctc]
 *
 * On Board's passport block, and the seven custom fields added on 25 Aug, are
 * read by name off a table rather than reached for one at a time — so any key
 * may be present.
 */

/**
 * @typedef {Object} Checkin
 * @property {string} name
 * @property {string} employee
 * @property {string} [employee_name] asked for by the In / Out report, which
 *   needs a name for a punch whose employee is not on the loaded master.
 *   Absent from the shorter field list that same read falls back to.
 * @property {string} [time]
 * @property {string} [log_type]
 * @property {string} [device_id]
 * @property {number} [skip_auto_attendance]
 */

/**
 * @typedef {Object} Company
 * @property {string} name
 * @property {string} [abbr]
 * @property {string} [default_holiday_list]
 */

/**
 * @typedef {Object} HolidayListRow
 * @property {string} name
 */

/**
 * @typedef {Object} Holiday
 * @property {string} holiday_date
 * @property {string} [description]
 * @property {number} [weekly_off]
 */

/**
 * A correction request, under either doctype name — see pendingRegularizations.
 * @typedef {Object} Regularization
 * @property {string} name
 * @property {string} employee
 * @property {string} [employee_name]
 * @property {string} [company]
 * @property {string} [attendance_date]
 * @property {string} [requested_in]
 * @property {string} [requested_out]
 * @property {string} [reason]
 * @property {string} [remarks]
 * @property {string} [status]
 * @property {string} [approver_type]
 * @property {string} [decided_by]
 * @property {string} [decided_on]
 * @property {string} [decision_note]
 * @property {string} [applied_on]
 * @property {string} [creation]
 * @property {string} [owner]
 * @property {string} [modified]
 * @property {string} [modified_by]
 * @property {string} [correction_for]
 * @property {string} [overtime_hours]
 * @property {string} [activity_type]
 */

/**
 * @typedef {Object} LeaveApplication
 * @property {string} name
 * @property {string} employee
 * @property {string} [employee_name]
 * @property {string} [company]
 * @property {string} [leave_type]
 * @property {string} [from_date]
 * @property {string} [to_date]
 * @property {number} [half_day]
 * @property {string} [half_day_date]
 * @property {number} [total_leave_days]
 * @property {number} [leave_balance]
 * @property {string} [leave_approver]
 * @property {string} [leave_approver_name]
 * @property {string} [posting_date]
 * @property {string} [status]
 * @property {string} [description]
 * @property {string} [creation]
 * @property {string} [owner]
 * @property {string} [modified]
 * @property {string} [modified_by]
 */

/**
 * Anything that can sit in an approval queue. The five unbuilt queues have no
 * doctype behind them, so this is deliberately the union rather than one of
 * them — a queue that silently renders nothing when rows finally arrive is the
 * failure that goes unnoticed longest.
 * @typedef {Regularization & Partial<LeaveApplication>} Request
 */

/**
 * @typedef {Object} Asset
 * @property {string} name
 * @property {string} [asset_name]
 * @property {string} [item_code]
 * @property {string} [asset_category]
 * @property {string} [company]
 * @property {string} [status]
 * @property {string} [location]
 * @property {string} [custodian]
 * @property {string} [department]
 * @property {string} [purchase_date]
 * @property {number} [gross_purchase_amount]
 */

/**
 * @typedef {Object} AssetMovement
 * @property {string} name
 * @property {string} [purpose]
 * @property {string} [transaction_date]
 * @property {string} [company]
 */

/**
 * @typedef {Object} LetterType
 * @property {string} name
 * @property {string} [category]
 * @property {number} [is_active]
 * @property {string} [fields_used]
 */

/**
 * @typedef {Object} EmployeeLetter
 * @property {string} name
 * @property {string} [employee]
 * @property {string} [employee_name]
 * @property {string} [letter_type]
 * @property {string} [letter_date]
 */

/**
 * @typedef {Object} Counts
 * @property {number} [companies]
 * @property {number} [shift]
 * @property {number} [holiday]
 * @property {number} [leavetype]
 * @property {number} [attendance]
 * @property {number} [departments]
 * @property {number} [designations]
 * @property {number} [left]
 */

/**
 * One decision made from this page, for the Approval Activities Log.
 * @typedef {Object} LogEntry
 * @property {string} at
 * @property {string} ref
 * @property {string} action
 * @property {string} status
 * @property {boolean} persisted
 * @property {string} [note]
 */

export {};
