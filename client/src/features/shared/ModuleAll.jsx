import ModuleMenu from "@/components/ModuleMenu";

/* Every module's "All" tab is the same page: Factor HR's whole menu for that
   module, item for item, with what answers each item here.

   One component rather than six, because the useful thing about this screen is
   that the modules can be compared with each other — and six hand-built index
   pages drift until they cannot be.

   It replaced three stubs that each said "the pages are on the bar above, this
   index has nothing of its own to show". Two of them also stated a menu size,
   from memory, and **both were wrong**: Leave's index called their menu three
   items where it has fourteen, and Attendance's called it seven where it has
   twenty-six. That is the whole argument for reading a menu rather than
   recalling one. */

export default function moduleAll(section, title) {
	function ModuleAll() {
		return <ModuleMenu section={section} title={title} />;
	}
	ModuleAll.displayName = `ModuleAll(${section})`;
	return ModuleAll;
}
