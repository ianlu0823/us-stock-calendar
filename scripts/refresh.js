import { refreshEarnings } from "../src/refreshEarnings.js";

const force = process.argv.includes("--force");

try {
  const cache = await refreshEarnings({ force });
  const meta = cache.meta;

  if (meta.status === "rejected") {
    console.error(`Refresh rejected: ${meta.rejectReason}`);
    meta.errors.forEach((error) => console.error(`  ${error.date}: ${error.message}`));
    console.error("Previous cache kept. Re-run with --force to overwrite anyway.");
    process.exitCode = 1;
  } else {
    console.log(
      `Refreshed ${meta.eventCount} earnings events from ${meta.startDate} to ${meta.endDate}.`,
    );

    if (meta.errors.length) {
      console.warn(`${meta.errors.length} request(s) failed. Cache status: ${meta.status}.`);
      meta.errors.forEach((error) => console.warn(`  ${error.date}: ${error.message}`));
    }

    if (meta.staleDates?.length) {
      console.warn(`Kept previous data for: ${meta.staleDates.join(", ")}`);
    }
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
