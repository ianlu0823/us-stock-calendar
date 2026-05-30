import { refreshEarnings } from "../src/refreshEarnings.js";

try {
  const cache = await refreshEarnings();
  console.log(
    `Refreshed ${cache.meta.eventCount} earnings events from ${cache.meta.startDate} to ${cache.meta.endDate}.`,
  );

  if (cache.meta.errors.length) {
    console.warn(`${cache.meta.errors.length} date(s) failed. Cache status: ${cache.meta.status}.`);
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
