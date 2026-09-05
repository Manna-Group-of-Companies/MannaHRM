import { Empty } from "@/components/ui";
import Simple from "./Simple";

export default function Survey() {
	return (
		<Simple
			title="Survey"
			gap="Surveys and acknowledgements."
			note={
				<>
					Empty in your tenant. Nothing to rebuild unless asked. <b>Sub-menu never screenshotted.</b>
				</>
			}
		/>
	);
}
