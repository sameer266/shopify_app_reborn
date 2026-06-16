import { useMemo, useState } from "react";
import {
  Page,
  Card,
  IndexTable,
  EmptyState,
  Box,
  InlineStack,
  BlockStack,
  Text,
  Thumbnail,
  Divider,
  useIndexResourceState,
  Badge,
  Button,
  Popover,
  DatePicker,
  Filters,
  ButtonGroup,
} from "@shopify/polaris";
import { CalendarIcon, ResetIcon } from "@shopify/polaris-icons";

// ── Helpers ───────────────────────────────────────────────────────────────────

function tsToMs(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === "function") return ts.toDate().getTime();
  if (ts.seconds) return ts.seconds * 1000;
  if (ts._seconds) return ts._seconds * 1000;
  const t = new Date(ts).getTime();
  return isNaN(t) ? null : t;
}

function formatDate(ts) {
  const ms = tsToMs(ts);
  return ms ? new Date(ms).toLocaleString("en-US") : "—";
}

function shortDate(d) {
  return d?.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function shortDateYear(d) {
  return d?.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const STATUS = {
  waiting:      { tone: "attention", label: "Waiting" },
  notified:     { tone: "success",   label: "Notified" },
  unsubscribed: { tone: "critical",  label: "Unsubscribed" },
};

const EMPTY_IMG =
  "https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png";

// ── Date Filter ───────────────────────────────────────────────────────────────

function DateFilter({ dates, onDatesChange }) {
  const [open, setOpen] = useState(false);
  const [{ month, year }, setMonthYear] = useState({
    month: new Date().getMonth(),
    year: new Date().getFullYear(),
  });

  const label = dates?.start
    ? `${shortDate(dates.start)} – ${dates.end ? shortDateYear(dates.end) : "…"}`
    : "All time";

  return (
    <Popover
      active={open}
      activator={
        <Button
          icon={CalendarIcon}
          onClick={() => setOpen((v) => !v)}
          disclosure={open ? "up" : "down"}
        >
          {label}
        </Button>
      }
      onClose={() => setOpen(false)}
      preferredAlignment="right"
    >
      <Box padding="300" minWidth="200px" maxWidth="250px">
        <BlockStack gap="300">
          <DatePicker
            month={month}
            year={year}
            onChange={onDatesChange}
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
              onClick={() => {
                onDatesChange(null);
                setOpen(false);
              }}
            >
              Clear
            </Button>
            <Button
              size="slim"
              variant="primary"
              onClick={() => setOpen(false)}
              disabled={!dates?.start}
            >
              Apply
            </Button>
          </InlineStack>
        </BlockStack>
      </Box>
    </Popover>
  );
}

// ── Filter Bar ────────────────────────────────────────────────────────────────

function FilterBar({ query, onQueryChange, dates, onDatesChange, placeholder }) {
  const dateLabel =
    dates?.start
      ? `${shortDate(dates.start)} – ${dates.end ? shortDateYear(dates.end) : "…"}`
      : "All time";

  const appliedFilters = dates?.start
    ? [{ key: "dateRange", label: dateLabel, onRemove: () => onDatesChange(null) }]
    : [];

  return (
    <InlineStack gap="300" blockAlign="center" wrap={false}>
      <div style={{ flexGrow: 1 }}>
        <Filters
          queryValue={query}
          queryPlaceholder={placeholder}
          filters={[]}
          appliedFilters={appliedFilters}
          onQueryChange={onQueryChange}
          onQueryClear={() => onQueryChange("")}
          onClearAll={() => { onQueryChange(""); onDatesChange(null); }}
        />
      </div>
      <DateFilter dates={dates} onDatesChange={onDatesChange} />
    </InlineStack>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────

function Empty({ heading, noData }) {
  return (
    <Box padding="800">
      <EmptyState heading={heading} image={EMPTY_IMG}>
        <Text as="p" tone="subdued">
          {noData
            ? "No restock subscribers yet. They'll appear here once customers sign up."
            : "Try adjusting your filters or search term."}
        </Text>
      </EmptyState>
    </Box>
  );
}

// ── Products Tab ──────────────────────────────────────────────────────────────

function ProductsTab({ rows, hasSubscribers, query, onQueryChange, dates, onDatesChange }) {
  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(rows);

  return (
    <>
      <Box padding="300">
        <FilterBar
          query={query}
          onQueryChange={onQueryChange}
          dates={dates}
          onDatesChange={onDatesChange}
          placeholder="Search products…"
        />
      </Box>
      <Divider />
      {rows.length === 0 ? (
        <Empty
          heading="No product subscriptions found"
          noData={!hasSubscribers}
        />
      ) : (
        <IndexTable
          resourceName={{ singular: "product", plural: "products" }}
          itemCount={rows.length}
          selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
          onSelectionChange={handleSelectionChange}
          promotedBulkActions={[{ content: "Export selected", onAction: () => {} }]}
          headings={[
            { title: "Product" },
            { title: "Variant" },
            { title: "Current requests" },
            { title: "Historical total" },
          ]}
          sortable={[false, false, true, true]}
        >
          {rows.map((row, i) => (
            <IndexTable.Row
              id={row.id}
              key={row.id}
              selected={selectedResources.includes(row.id)}
              position={i}
            >
              <IndexTable.Cell>
                <InlineStack gap="300" blockAlign="center" wrap={false}>
                  <Thumbnail
                    source={row.image_url ?? EMPTY_IMG}
                    alt={row.product_title}
                    size="small"
                  />
                  <Text fontWeight="semibold" as="span">
                    {row.product_title}
                  </Text>
                </InlineStack>
              </IndexTable.Cell>
              <IndexTable.Cell>
                <Text tone="subdued" as="span">
                  {row.variant_title ?? "—"}
                </Text>
              </IndexTable.Cell>
              <IndexTable.Cell>
                <Text as="span">{row.current_requests}</Text>
              </IndexTable.Cell>
              <IndexTable.Cell>
                <Text as="span">{row.historical_total}</Text>
              </IndexTable.Cell>
            </IndexTable.Row>
          ))}
        </IndexTable>
      )}
    </>
  );
}

// ── Subscribers Tab ───────────────────────────────────────────────────────────

function SubscribersTab({ rows, hasSubscribers, query, onQueryChange, dates, onDatesChange }) {
  const indexed = rows.map((_, i) => ({ id: String(i) }));
  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(indexed);

  return (
    <>
      <Box padding="300">
        <FilterBar
          query={query}
          onQueryChange={onQueryChange}
          dates={dates}
          onDatesChange={onDatesChange}
          placeholder="Search by email or product…"
        />
      </Box>
      <Divider />
      {rows.length === 0 ? (
        <Empty heading="No subscribers found" noData={!hasSubscribers} />
      ) : (
        <IndexTable
          resourceName={{ singular: "subscriber", plural: "subscribers" }}
          itemCount={rows.length}
          selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
          onSelectionChange={handleSelectionChange}
          promotedBulkActions={[{ content: "Export selected", onAction: () => {} }]}
          headings={[
            { title: "Email" },
            { title: "Product" },
            { title: "Variant" },
            { title: "Status" },
            { title: "Subscribed" },
          ]}
        >
          {rows.map((s, i) => {
            const badge = STATUS[s.status] ?? { tone: "new", label: s.status ?? "Unknown" };
            return (
              <IndexTable.Row
                id={String(i)}
                key={i}
                selected={selectedResources.includes(String(i))}
                position={i}
              >
                <IndexTable.Cell>
                  <Text fontWeight="semibold" as="span">
                    {s.customer_email || "—"}
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text tone="subdued" as="span">
                    {s.product_title || s.product_id || "—"}
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text as="span">
                    {s.variant_title || s.variant_id || "—"}
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Badge tone={badge.tone}>{badge.label}</Badge>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text tone="subdued" as="span">
                    {formatDate(s.created_at)}
                  </Text>
                </IndexTable.Cell>
              </IndexTable.Row>
            );
          })}
        </IndexTable>
      )}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SubscribersPage({ subscribers = [] }) {
  const [tab, setTab]     = useState(0);
  const [query, setQuery] = useState("");
  const [dates, setDates] = useState(null);

  const q = query.toLowerCase();

  function inRange(ts) {
    if (!dates?.start) return true;
    const ms = tsToMs(ts);
    if (!ms) return true;
    const lo = dates.start.getTime();
    const hi = dates.end
      ? new Date(dates.end).setHours(23, 59, 59, 999)
      : Infinity;
    return ms >= lo && ms <= hi;
  }

  const productRows = useMemo(() => {
    const map = new Map();
    subscribers.forEach((s) => {
      const key = `${s.product_id}__${s.variant_id ?? ""}`;
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          product_title: s.product_title ?? s.product_id ?? "—",
          variant_title: s.variant_title ?? s.variant_id ?? null,
          image_url: s.image_url ?? null,
          current_requests: 0,
          historical_total: 0,
        });
      }
      const row = map.get(key);
      if (s.status === "waiting") row.current_requests++;
      row.historical_total++;
    });
    return Array.from(map.values());
  }, [subscribers]);

  const filteredProducts = useMemo(
    () =>
      productRows.filter(
        (r) =>
          !q ||
          `${r.product_title} ${r.variant_title ?? ""}`
            .toLowerCase()
            .includes(q)
      ),
    [productRows, q]
  );

  const filteredSubs = useMemo(
    () =>
      subscribers.filter((s) => {
        if (!inRange(s.created_at)) return false;
        if (
          q &&
          !`${s.customer_email} ${s.product_title} ${s.product_id} ${s.variant_title} ${s.variant_id}`
            .toLowerCase()
            .includes(q)
        )
          return false;
        return true;
      }),
    [subscribers, dates, q]
  );

  const TABS = [
    { id: "products",    label: "Product Subscriptions" },
    { id: "subscribers", label: "Subscribers List" },
  ];

  return (
    <Page fullWidth>
      <BlockStack gap="400">
        <ButtonGroup variant="segmented">
          {TABS.map((t, i) => (
            <Button key={t.id} pressed={tab === i} onClick={() => setTab(i)}>
              {t.label}
            </Button>
          ))}
        </ButtonGroup>

        <Card padding="0">
          {tab === 0 ? (
            <ProductsTab
              rows={filteredProducts}
              hasSubscribers={subscribers.length > 0}
              query={query}
              onQueryChange={setQuery}
              dates={dates}
              onDatesChange={setDates}
            />
          ) : (
            <SubscribersTab
              rows={filteredSubs}
              hasSubscribers={subscribers.length > 0}
              query={query}
              onQueryChange={setQuery}
              dates={dates}
              onDatesChange={setDates}
            />
          )}
        </Card>
      </BlockStack>

      <Box paddingBlockEnd="600" />
    </Page>
  );
}
