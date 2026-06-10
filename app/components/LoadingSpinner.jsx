import {
  Card, Box, BlockStack, InlineStack, SkeletonBodyText, SkeletonDisplayText,
  SkeletonThumbnail, Divider,
} from "@shopify/polaris";

/**
 * Loading spinner for stat cards
 */
export function StatCardLoader() {
  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="start">
          <Box width="40%">
            <SkeletonBodyText lines={1} />
          </Box>
          <SkeletonThumbnail size="small" />
        </InlineStack>
        <Box width="30%">
          <SkeletonDisplayText size="large" />
        </Box>
        <Box width="50%">
          <SkeletonBodyText lines={1} />
        </Box>
      </BlockStack>
    </Card>
  );
}

/**
 * Loading spinner for analytics KPI row
 */
export function AnalyticsKPILoader() {
  return (
    <InlineStack gap="400" blockAlign="stretch">
      <StatCardLoader />
      <StatCardLoader />
      <StatCardLoader />
      <StatCardLoader />
      <StatCardLoader />
    </InlineStack>
  );
}

/**
 * Loading spinner for table/index
 */
export function TableLoader() {
  return (
    <Card padding="0">
      <Box padding="400" paddingBlockEnd="300">
        <SkeletonDisplayText size="medium" />
      </Box>
      <Divider />
      <Box padding="400">
        <BlockStack gap="300">
          {Array.from({ length: 5 }).map((_, i) => (
            <InlineStack key={i} gap="400" blockAlign="center">
              <SkeletonThumbnail size="small" />
              <BlockStack gap="100" blockInlineSize="100%">
                <Box width="60%">
                  <SkeletonBodyText lines={1} />
                </Box>
                <Box width="40%">
                  <SkeletonBodyText lines={1} />
                </Box>
              </BlockStack>
            </InlineStack>
          ))}
        </BlockStack>
      </Box>
    </Card>
  );
}

/**
 * Loading spinner for top products table
 */
export function TopProductsLoader() {
  return <TableLoader />;
}

/**
 * Loading spinner for subscribers page
 */
export function SubscribersPageLoader() {
  return (
    <BlockStack gap="400">
      <Box paddingBlockEnd="400">
        <SkeletonDisplayText size="large" />
      </Box>
      <Card padding="0">
        <Box padding="400">
          <SkeletonBodyText lines={2} />
        </Box>
        <Divider />
        <Box padding="400">
          <BlockStack gap="300">
            {Array.from({ length: 6 }).map((_, i) => (
              <InlineStack key={i} gap="300" blockAlign="center">
                <SkeletonThumbnail size="small" />
                <BlockStack gap="100" blockInlineSize="100%">
                  <Box width="50%">
                    <SkeletonBodyText lines={1} />
                  </Box>
                  <Box width="40%">
                    <SkeletonBodyText lines={1} />
                  </Box>
                </BlockStack>
              </InlineStack>
            ))}
          </BlockStack>
        </Box>
      </Card>
    </BlockStack>
  );
}

/**
 * Loading spinner for analytics page
 */
export function AnalyticsPageLoader() {
  return (
    <BlockStack gap="500">
      {/* KPI Row */}
      <InlineStack gap="400" blockAlign="stretch">
        {Array.from({ length: 5 }).map((_, i) => (
          <StatCardLoader key={i} />
        ))}
      </InlineStack>

      {/* Top Products Card */}
      <Card padding="0">
        <Box padding="400" paddingBlockEnd="300">
          <SkeletonDisplayText size="medium" />
        </Box>
        <Divider />
        <Box padding="400">
          <BlockStack gap="300">
            {Array.from({ length: 5 }).map((_, i) => (
              <InlineStack key={i} gap="300" blockAlign="center">
                <SkeletonThumbnail size="small" />
                <BlockStack gap="050" blockInlineSize="100%">
                  <Box width="60%">
                    <SkeletonBodyText lines={1} />
                  </Box>
                  <Box width="45%">
                    <SkeletonBodyText lines={1} />
                  </Box>
                </BlockStack>
              </InlineStack>
            ))}
          </BlockStack>
        </Box>
      </Card>

      {/* Metrics Row */}
      <InlineStack gap="400" blockAlign="stretch">
        <Card blockInlineSize="100%">
          <BlockStack gap="300">
            <SkeletonDisplayText size="small" />
            <Divider />
            <SkeletonBodyText lines={3} />
          </BlockStack>
        </Card>
        <Card blockInlineSize="100%">
          <BlockStack gap="300">
            <SkeletonDisplayText size="small" />
            <Divider />
            <SkeletonBodyText lines={3} />
          </BlockStack>
        </Card>
      </InlineStack>
    </BlockStack>
  );
}
