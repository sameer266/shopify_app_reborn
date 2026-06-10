import { runInventorySync } from "./helper.js"

async function main() {
  try {
    console.log("=".repeat(60));
    console.log("CRON: Inventory Sync Started at", new Date().toISOString());
    console.log("=".repeat(60));

    const syncResult = await runInventorySync();
    
    console.log("=".repeat(60));
    console.log("CRON: Sync Summary");
    console.log(`  Processed: ${syncResult.processed}`);
    console.log(`  Failed: ${syncResult.failed}`);
    console.log(`  Duration: ${syncResult.duration}ms`);
    console.log(`  Status: ${syncResult.success ? "SUCCESS ✓" : "PARTIAL FAILURE ⚠"}`);
    console.log("=".repeat(60));

    // Exit with 0 even if some failed (cron shouldn't be marked as failed if partially succeeded)
    process.exit(0);
  } catch (error) {
    console.error("=".repeat(60));
    console.error("CRON: FATAL ERROR");
    console.error("Message:", error.message);
    console.error("Stack:", error.stack);
    console.error("=".repeat(60));
    process.exit(1);
  }
}

main();
