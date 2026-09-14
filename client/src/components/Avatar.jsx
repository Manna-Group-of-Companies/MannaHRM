import { useState } from "react";
import { initials } from "@/lib/format";

/* A person's circle: their photograph when the record names one, their
   initials when it does not — **or when the one it names will not load.** A
   File deleted on the desk leaves `Employee.image` pointing at nothing, and a
   broken-image glyph in a circle reads as this page being broken rather than
   the record.

   One component for Employee Master's cards and the profile's header, so the
   two cannot disagree about whether somebody has a photograph.

   `alt` is empty on purpose: the name is printed beside every one of these,
   and a screen reader reading it twice per card is noise. `lazy`, because
   Employee Master can draw the whole group at once and each photograph is a
   separate request against a site with a daily compute limit. */
export default function Avatar({ name, image, className, children }) {
	const [broken, setBroken] = useState("");
	const src = image && broken !== image ? image : "";
	return (
		<div className={className}>
			{src
				? <img src={src} alt="" loading="lazy" onError={() => setBroken(image)} />
				: initials(name)}
			{children}
		</div>
	);
}
