import { useState } from "react";
import {
  BlockStack, InlineStack, Text, Badge,
  Button, Box, Icon, InlineGrid, Card, Divider,
} from "@shopify/polaris";
import {
  MinusCircleIcon, ChevronDownIcon, ChevronUpIcon,
  ExternalIcon, CheckIcon, AlertCircleIcon, CheckCircleIcon,
} from "@shopify/polaris-icons";

const buildEmbedUrl = (shop, themeId) => {
  if (!shop) return null;
  return themeId
    ? `https://${shop}/admin/themes/${themeId}/editor?context=apps`
    : `https://${shop}/admin/themes/current/editor?context=apps`;
};

const buildPreviewUrl = (shop, handle) => {
  if (!shop || !handle) return null;
  return `https://${shop}/products/${handle}`;
};

// ── Checklist item ────────────────────────────────────────────────────────────

function ChecklistItem({ title, description, open, onToggle, done, children }) {
  return (
    <Box
      background={open ? "bg-surface-secondary" : "bg-surface"}
      borderWidth="025"
      borderColor="border"
      borderRadius="200"
      padding="400"
    >
      <div onClick={onToggle} style={{ cursor: "pointer", userSelect: "none" }}>
        <InlineGrid columns="1fr auto" alignItems="start">
          <InlineStack gap="300" blockAlign="start" wrap={false}>
            <Box paddingBlockStart="050">
              <Icon
                source={done ? CheckCircleIcon : MinusCircleIcon}
                tone={done ? "success" : "subdued"}
              />
            </Box>
            <BlockStack gap="100">
              <InlineStack gap="200" blockAlign="center">
                <Text variant="headingSm" as="h3">{title}</Text>
                {done
                  ? <Badge tone="success">Done</Badge>
                  : <Badge tone="caution" icon={AlertCircleIcon}>Required</Badge>
                }
              </InlineStack>
              <Text tone="subdued" as="p">{description}</Text>
            </BlockStack>
          </InlineStack>
          <Icon source={open ? ChevronUpIcon : ChevronDownIcon} tone="subdued" />
        </InlineGrid>
      </div>

      {open && (
        <Box paddingBlockStart="300" onClick={(e) => e.stopPropagation()}>
          {children}
        </Box>
      )}
    </Box>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AppStatusPage({ shop = "", themeId = null, productHandle = null }) {
  const [embedOpen, setEmbedOpen] = useState(false);
  const [embedDone, setEmbedDone] = useState(false);
  const [testOpen,  setTestOpen]  = useState(false);
  const [testDone,  setTestDone]  = useState(false);

  const embedUrl   = buildEmbedUrl(shop, themeId);   // null when shop missing
  const previewUrl = buildPreviewUrl(shop, productHandle); // null when shop or handle missing

  const doneCount = [embedDone, testDone].filter(Boolean).length;

  return (
    <BlockStack gap="400">

      {/* Setup checklist */}
      <Card padding="0">
        <Box padding="400" paddingBlockEnd="300">
          <InlineStack align="space-between" blockAlign="center">
            <BlockStack gap="050">
              <Text variant="headingMd" as="h2">Setup checklist</Text>
              <Text variant="bodySm" tone="subdued">
                Complete these steps to activate your restock button
              </Text>
            </BlockStack>
            <Text variant="bodySm" tone={doneCount === 2 ? "success" : "subdued"}>
              {doneCount} / 2 complete
            </Text>
          </InlineStack>
        </Box>

        <Divider />

        <Box padding="400">
          <BlockStack gap="300">

            <ChecklistItem
              title="Enable app embed"
              description="Open your theme editor and enable the Back in Stock app embed to display the button on product pages."
              open={embedOpen}
              onToggle={() => setEmbedOpen((v) => !v)}
              done={embedDone}
            >
              <InlineStack gap="200">
                <Button
                  variant="primary"
                  icon={ExternalIcon}
                  url={embedUrl ?? undefined}
                  target="_blank"
                  disabled={!embedUrl}   // ← disabled only when URL unavailable
                >
                  Enable in theme editor
                </Button>
                <Button
                  icon={CheckIcon}
                  onClick={() => { setEmbedDone(true); setEmbedOpen(false); }}
                >
                  I've done this
                </Button>
              </InlineStack>
            </ChecklistItem>

            <ChecklistItem
              title="Test your button"
              description="Visit a product page and verify the restock button appears correctly."
              open={testOpen}
              onToggle={() => setTestOpen((v) => !v)}
              done={testDone}
            >
              <BlockStack gap="200">
                <Text as="p">
                  Preview mode is active. Check your product page to confirm the button works correctly.
                </Text>
                <InlineStack gap="200">
                  <Button
                    variant="primary"
                    icon={ExternalIcon}
                    url={previewUrl ?? undefined}
                    target="_blank"
                    disabled={!previewUrl}   // ← disabled only when shop+handle both present
                  >
                    Preview product page
                  </Button>
                  <Button
                    icon={CheckIcon}
                    onClick={() => { setTestDone(true); setTestOpen(false); }}
                  >
                    Looks good
                  </Button>
                </InlineStack>
              </BlockStack>
            </ChecklistItem>

          </BlockStack>
        </Box>
      </Card>

      {/* Quick settings */}
      <Card>
        <BlockStack gap="300">
          <Text variant="headingMd" as="h2">Quick settings</Text>
          <Box
            background="bg-surface-secondary"
            borderWidth="025"
            borderColor="border"
            borderRadius="200"
            padding="400"
          >
            <InlineStack align="space-between" blockAlign="center" gap="400">
              <InlineStack gap="300" blockAlign="center">
                <Icon source={CheckCircleIcon} tone="success" />
                <BlockStack gap="050">
                  <Text variant="headingSm" as="h3">App embed status</Text>
                  <Text variant="bodySm" tone="subdued">Your theme embed is active</Text>
                </BlockStack>
                <Badge tone="success">On</Badge>
              </InlineStack>
              <Button
                icon={ExternalIcon}
                url={embedUrl ?? undefined}
                target="_blank"
                disabled={!embedUrl}   // ← same logic here
              >
                App embed settings
              </Button>
            </InlineStack>
          </Box>
        </BlockStack>
      </Card>

    </BlockStack>
  );
}