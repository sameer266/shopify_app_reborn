import { useLoaderData } from "react-router";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import {
  getAllSubscribers,
  getAllInventoryStates,
  getAllNotificationLogs,
} from "../services/firestore.server.js";
import AppStatusPage from "../components/AppStatusPage";
import {
  Page, Layout, Card, Text, BlockStack, InlineStack,
  InlineGrid, IndexTable, Badge, Box, Button, Popover,
  DatePicker, Icon, Divider, EmptyState,
} from "@shopify/polaris";

import {
  CalendarIcon, PersonIcon, ProductIcon, EmailIcon, ResetIcon,
} from "@shopify/polaris-icons";


// ── Helpers ───────────────────────────────────────────────────────────────────




const getTs = (ts) => {
  if (!ts) return null;
  if (typeof ts.toDate === "function") return ts.toDate().getTime();
  if (ts.seconds)  return ts.seconds  * 1000;
  if (ts._seconds) return ts._seconds * 1000;
  const t = new Date(ts).getTime();
  return isNaN(t) ? null : t;
};

const formatDate = (ts) => {
  const ms = getTs(ts);
  return ms ? new Date(ms).toLocaleString("en-US") : "—";
};



const shortDate = (d) =>
  d?.toLocaleDateString("en-US", { month: "short", day: "numeric" });

const shortDateYear = (d) =>
  d?.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

// ── Loader ────────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {

  const  {admin,session} = await authenticate.admin(request);
  const shop =  session.shop;

  const themeResponse = await admin.graphql(`
    query getActiveTheme{
    themes(first:10 , roles:[MAIN]){
    
    nodes{
    id
    name
    role
    }
    }
    }`);

    const themeData = await themeResponse.json();
    const activeTheme = themeData?.data.themes.nodes[0];
    
    const themeId = activeTheme?.id?.split("/").pop() ?? null;


  
  const [subscribers, inventoryStates, logs] = await Promise.all([
    getAllSubscribers(),
    getAllInventoryStates(),
    getAllNotificationLogs(),
  ]);

    const  firstSub =  subscribers[0];
    let productHandle = null;
    if(firstSub?.product_id){
      const productRes = await admin.graphql(`
        query getproductHandle($id :ID!){
        product (id:$id){
        handle
        }}`, {
          variables:{id:`gid://shopify/Product/${firstSub.product_id}`}
        });
        const productData = await productRes.json();
        productHandle = productData.data.product?.handle ?? null;
    }
        
  return { subscribers, inventoryStates, logs , shop, themeId, productHandle};
};

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, tone = "base" }) {
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
      </BlockStack>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Index() {
  const { subscribers, logs , shop , themeId ,productHandle} = useLoaderData();

  const [popoverActive, setPopoverActive] = useState(false);
  const [{ month, year }, setMonthYear]   = useState({ month: new Date().getMonth(), year: new Date().getFullYear() });
  const [dates, setDates]                 = useState(null); // { start: Date, end: Date } | null

  // ── filter ───────────────────────────────────────────────────────────────

  const inRange = (value) => {
    if (!dates?.start) return true;
    const t   = new Date(value).getTime();
    const lo  = dates.start.getTime();
    const hi  = dates.end ? new Date(dates.end).setHours(23, 59, 59, 999) : Infinity;
    return t >= lo && t <= hi;
  };

  const filteredSubs = subscribers.filter((s) => inRange(s.created_at));
  const filteredLogs = logs.filter((l) => inRange(l.sent_at));

  const totalSubscribers = filteredSubs.length;
  const activeProducts   = new Set(filteredSubs.map((s) => `${s.product_id}/${s.variant_id}`)).size;
  const emailsSent       = filteredLogs.filter((l) => l.email_sent).length;

  const recentActivity = [
    ...filteredSubs.slice(-3).reverse().map((s) => ({
      type: "Subscription",
      detail: `Subscribed to ${s.product_id || "—"} / ${s.variant_id || "—"}`,
      time: formatDate(s.created_at),
    })),
    ...filteredLogs.slice(-3).reverse().map((l) => ({
      type: l.email_sent ? "Email Sent" : "Email Failed",
      detail: `Variant ${l.variant_id || "—"}`,
      time: formatDate(l.sent_at),
    })),
  ].slice(0, 8);

  // ── date label ───────────────────────────────────────────────────────────

  const dateLabel = dates?.start
    ? `${shortDate(dates.start)} – ${dates.end ? shortDateYear(dates.end) : "…"}`
    : "All time";

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <Page title="Restock Born" subtitle="Subscribers, inventory tracking, and notifications">
      <Layout>

        {/* App Status */}
        <Layout.Section>
          <AppStatusPage shop={shop} themeId={themeId}  productHandle={productHandle}  />
        </Layout.Section>

        {/* Date filter */}
        <Layout.Section>
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
              {/* smaller container = more compact picker */}
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
        </Layout.Section>

        {/* Metrics */}
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
            <StatCard label="Total Subscribers" value={totalSubscribers} icon={PersonIcon} />
            <StatCard label="Active Products"   value={activeProducts}   icon={ProductIcon} />
            <StatCard label="Emails Sent"       value={emailsSent}       icon={EmailIcon} tone="success" />
          </InlineGrid>
        </Layout.Section>

        {/* Activity table */}
        <Layout.Section>
          <Card padding="0">
            <Box padding="400" paddingBlockEnd="300">
              <BlockStack gap="050">
                <Text variant="headingMd" as="h2">Recent activity</Text>
                <Text variant="bodySm" tone="subdued">
                  {recentActivity.length} event{recentActivity.length !== 1 ? "s" : ""}
                  {dates?.start ? " in selected range" : ""}
                </Text>
              </BlockStack>
            </Box>

            <Divider />

            {recentActivity.length === 0 ? (
              <Box padding="800">
                <EmptyState
                  heading="No activity yet"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <Text as="p" tone="subdued">
                    Activity will appear here as customers subscribe and emails are sent.
                  </Text>
                </EmptyState>
              </Box>
            ) : (
              <IndexTable
                resourceName={{ singular: "activity", plural: "activities" }}
                itemCount={recentActivity.length}
                selectable={false}
                headings={[
                  { title: "Type" },
                  { title: "Details" },
                  { title: "Time", alignment: "end" },
                ]}
              >
                {recentActivity.map((item, i) => (
                  <IndexTable.Row id={String(i)} key={i} position={i}>
                    <IndexTable.Cell>
                      <Badge
                        tone={
                          item.type === "Email Failed" ? "critical"
                          : item.type === "Email Sent" ? "success"
                          : "info"
                        }
                      >
                        {item.type}
                      </Badge>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="span">{item.detail}</Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell flush>
                      <Box paddingInlineEnd="300">
                        <Text tone="subdued" alignment="end" as="span">{item.time}</Text>
                      </Box>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            )}
          </Card>
        </Layout.Section>

      </Layout>
          <Box paddingBlockEnd="600" />
    </Page>
  );
}