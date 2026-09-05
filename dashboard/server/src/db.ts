import mongoose from "mongoose";
import { env } from "./env.js";

/* ---------------------------------------------------------------------------
   The one connection.

   `strictQuery` is on deliberately: a filter naming a field the schema does not
   have is silently dropped otherwise, and a dropped filter does not return an
   error — it returns *everybody*. On a leave queue that reads as a hundred and
   sixty people all waiting for a decision.
   --------------------------------------------------------------------------- */

mongoose.set("strictQuery", true);

export async function connect(): Promise<void> {
	await mongoose.connect(env.mongoUri, {
		serverSelectionTimeoutMS: 10_000,
		/* Nothing this API does is worth a request hanging on. Mongo is either
		   local or an Atlas hop away; thirty seconds is already generous. */
		socketTimeoutMS: 30_000,
	});
}

export async function disconnect(): Promise<void> {
	await mongoose.connection.close();
}

export { mongoose };
