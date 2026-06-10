import { useLoaderData } from "react-router";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import {
  getAllSubscribers,
  getAllNotificationLogs,
  getTopRequestedProducts,
  getNotificationMetrics,
} from "../services/firestore.server.js";
import {
  Page, Card, Text, Box, BlockStack, InlineStack,
  InlineGrid, Icon, Badge, Divider, IndexTable, Thumbnail,
  EmptyState, Button, Popover, DatePicker,
} from "@shopify/polaris";
import {
  PersonIcon, InventoryIcon, EmailIcon, EyeCheckMarkIcon,
  CursorIcon, ChartHistogramGrowthIcon, CalendarIcon, ResetIcon,
} from "@shopify/polaris-icons";

// ── Helpers ───────────────────────────────────────────────────────────────────

const pct = (v) => `${Math.round(v * 100)}%`;

const shortDate = (d) =>
  d?.toLocaleDateString("en-US", { month: "short", day: "numeric" });

const shortDateYear = (d) =>
  d?.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const inRange = (value, dates) => {
  if (!dates?.start) return true;
  const t = new Date(value).getTime();
  const lo = dates.start.getTime();
  const hi = dates.end ? new Date(dates.end).setHours(23, 59, 59, 999) : Infinity;
  return t >= lo && t <= hi;
};

// ── Loader ────────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  const [subscribers, notificationLogs, topProducts, metrics] = await Promise.all([
    getAllSubscribers(),
    getAllNotificationLogs(),
    getTopRequestedProducts(10),
    getNotificationMetrics(),
  ]);
  return { subscribers, notificationLogs, topProducts, metrics };
};

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, tone = "base", hint }) {
  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <Text variant="bodySm" tone="subdued">{label}</Text>
          <Box background="bg-surface-secondary" borderRadius="200" padding="150">
            <Icon source={icon} tone={tone} />
          </Box>
        </InlineStack>
        <Text variant="heading2xl" as="p">{value}</Text>
        {hint && <Text variant="bodySm" tone="subdued">{hint}</Text>}
      </BlockStack>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AnalyticsRoute() {
  const { subscribers, notificationLogs, topProducts, metrics } = useLoaderData();

  // ── date filter state ─────────────────────────────────────────────────────

  const [popoverActive, setPopoverActive] = useState(false);
  const [{ month, year }, setMonthYear] = useState({ month: new Date().getMonth(), year: new Date().getFullYear() });
  const [dates, setDates] = useState(null);

  const dateLabel = dates?.start
    ? `${shortDate(dates.start)} – ${dates.end ? shortDateYear(dates.end) : "…"}`
    : "All time";

  // ── filtered data ─────────────────────────────────────────────────────────

  const filteredSubs = subscribers.filter((s) => inRange(s.created_at, dates));
  const filteredLogs = notificationLogs.filter((l) => inRange(l.sent_at, dates));

  const totalSubscribers = filteredSubs.length;
  const totalNotifications = filteredLogs.length;
  const uniqueProducts = new Set(filteredSubs.map((s) => `${s.product_id}/${s.variant_id}`)).size;
  const waitingSubscribers = filteredSubs.filter((s) => s.status === "waiting").length;
  const openRate = dates ? (filteredLogs.length ? metrics.notifications.successRate || 0 : 0) : (metrics.notifications.successRate || 0);

  const rateTone = openRate >= 0.8 ? "success" : openRate >= 0.5 ? "caution" : "critical";
  const rateHint = openRate >= 0.8 ? "Excellent" : openRate >= 0.5 ? "Good" : "Needs improvement";

  // top products filtered by date
  const filteredTopProducts = dates?.start
    ? topProducts.filter((p) => inRange(p.last_request_at, dates))
    : topProducts;

  return (
    <Page
      title="Analytics & Reports"
      subtitle="Subscriber growth, notification performance, and product demand trends."
      fullWidth
    >
      <BlockStack gap="500">

        {/* ── Date filter ───────────────────────────────────────────── */}
        <InlineStack gap="300" blockAlign="center">
          <Popover
            active={popoverActive}
            activator={
              <Button
                icon={CalendarIcon}
                onClick={() => setPopoverActive((v) => !v)}
                disclosure={popoverActive ? "up" : "down"}
              >
                {dateLabel}
              </Button>
            }
            onClose={() => setPopoverActive(false)}
            preferredAlignment="left"
          >
            <Box padding="300" minWidth="200px" maxWidth="250px">
              <BlockStack gap="300">
                <DatePicker
                  month={month}
                  year={year}
                  onChange={setDates}
                  onMonthChange={(m, y) => setMonthYear({ month: m, year: y })}
                  selected={dates}
                  allowRange
                  disableDatesAfter={new Date()}
                />
                <Divider />
                <InlineStack align="space-between">
                  <Button
                    size="slim"
                    icon={ResetIcon}
                    onClick={() => { setDates(null); setPopoverActive(false); }}
                  >
                    Clear
                  </Button>
                  <Button
                    size="slim"
                    variant="primary"
                    onClick={() => setPopoverActive(false)}
                    disabled={!dates?.start}
                  >
                    Apply
                  </Button>
                </InlineStack>
              </BlockStack>
            </Box>
          </Popover>

          {dates?.start && (
            <Text tone="subdued" variant="bodySm">Filtered by date range</Text>
          )}
        </InlineStack>

        {/* ── KPI row ───────────────────────────────────────────────── */}
        <InlineGrid columns={{ xs: 1, sm: 2, md: 5 }} gap="400">
          <StatCard label="Total Subscribers" value={totalSubscribers} icon={PersonIcon} hint="All time" />
          <StatCard label="Tracked Products" value={uniqueProducts} icon={InventoryIcon} hint="Unique variants" />
          <StatCard label="Notifications Sent" value={totalNotifications} icon={EmailIcon} tone="info" hint="Restock emails" />
          <StatCard label="Success Rate" value={pct(openRate)} icon={EyeCheckMarkIcon} tone={rateTone} hint={rateHint} />
          <StatCard label="Waiting Subscribers" value={waitingSubscribers} icon={CursorIcon} tone="attention" hint="Ready for restock" />
        </InlineGrid>

        {/* ── Top Requested Products ────────────────────────────────── */}
        <Card padding="0">
          <Box padding="400" paddingBlockEnd="300">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="050">
                <InlineStack gap="200" blockAlign="center">
                  <Icon source={ChartHistogramGrowthIcon} tone="base" />
                  <Text variant="headingMd" as="h2">Top Requested Products</Text>
                </InlineStack>
                <Text variant="bodySm" tone="subdued">
                  {dates?.start ? "Most subscribed in selected range" : "Most subscribed product variants"}
                </Text>
              </BlockStack>
            </InlineStack>
          </Box>

          <Divider />

          {filteredTopProducts.length === 0 ? (
            <Box padding="800">
              <EmptyState
                heading="No product data yet"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <Text as="p" tone="subdued">
                  {dates?.start
                    ? "No products found in the selected date range."
                    : "Once customers subscribe, top products will appear here."}
                </Text>
              </EmptyState>
            </Box>
          ) : (
            <IndexTable
              resourceName={{ singular: "product", plural: "products" }}
              itemCount={filteredTopProducts.length}
              selectable={false}
              headings={[
                { title: "Product" },
                { title: "Waiting" },
                { title: "Notified" },
                { title: "Total" },
              ]}
              sortable={[false, true, true, true]}
            >
              {filteredTopProducts.map((p, i) => (
                <IndexTable.Row id={String(i)} key={i} position={i}>
                  <IndexTable.Cell>
                    <InlineStack gap="300" blockAlign="center" wrap={false}>
                      <Thumbnail
                        source={p.image_url || "https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"}
                        alt={p.product_title}
                        size="small"
                      />
                      <BlockStack gap="050">
                        <Text fontWeight="semibold" as="span">{p.product_title}</Text>
                        <Text variant="bodySm" tone="subdued" as="span">
                          {p.variant_title || p.variant_id}
                        </Text>
                      </BlockStack>
                    </InlineStack>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span">{p.waiting}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>

                    <Text as="span">{p.notified}</Text>

                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span">{p.count}</Text>
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          )}
        </Card>

      </BlockStack>

      <Box paddingBlockEnd="600" />
    </Page>
  );
}