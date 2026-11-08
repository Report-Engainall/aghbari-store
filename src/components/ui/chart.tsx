import * as React from "react";
import * as RechartsPrimitive from "recharts";

import { cn } from "@/lib/utils";

// Format: { THEME_NAME: CSS_SELECTOR }
const THEMES = { light: "", dark: ".dark" } as const;

export type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode;
    icon?: React.ComponentType;
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof THEMES, string> }
  );
};

type ChartContextProps = {
  config: ChartConfig;
};

const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);

  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />");
  }

  return context;
}

function ChartLegendColorSwatch({ color }: { color: string | undefined }) {
  return <div className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: color }} />;
}

const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    config: ChartConfig;
    children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"];
  }
>(({ id, className, children, config, ...props }, ref) => {
  const uniqueId = React.useId();
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-chart={chartId}
        ref={ref}
        className={cn(
          "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-none [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-sector]:outline-none [&_.recharts-surface]:outline-none",
          className,
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
});
ChartContainer.displayName = "Chart";

type ChartColorConfigEntry = [string, ChartConfig[string]];

function chartThemeVariable(
  entry: ChartColorConfigEntry,
  theme: keyof typeof THEMES,
): string | null {
  const [key, itemConfig] = entry;
  const color = itemConfig.theme?.[theme] || itemConfig.color;
  return color ? `  --color-${key}: ${color};` : null;
}

function chartThemeBlock(
  id: string,
  theme: keyof typeof THEMES,
  prefix: string,
  colorConfig: ChartColorConfigEntry[],
): string {
  const variables = colorConfig
    .map((entry) => chartThemeVariable(entry, theme))
    .filter((value): value is string => value !== null);
  return `${prefix} [data-chart=${id}] {
${variables.join("\n")}
}
`;
}

function buildChartThemeCss(id: string, colorConfig: ChartColorConfigEntry[]): string {
  const themes = Object.entries(THEMES) as Array<[keyof typeof THEMES, string]>;
  return themes.map(([theme, prefix]) => chartThemeBlock(id, theme, prefix, colorConfig)).join("\n");
}

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  const colorConfig = Object.entries(config).filter(([, itemConfig]) => itemConfig.theme || itemConfig.color) as ChartColorConfigEntry[];
  if (!colorConfig.length) return null;
  return <style dangerouslySetInnerHTML={{ __html: buildChartThemeCss(id, colorConfig) }} />;
};

const ChartTooltip = RechartsPrimitive.Tooltip;


type ChartTooltipIndicatorKind = "line" | "dot" | "dashed";

function ChartTooltipIndicator({
  icon,
  hideIndicator,
  indicator,
  nestLabel,
  color,
}: {
  icon?: React.ComponentType;
  hideIndicator: boolean;
  indicator: ChartTooltipIndicatorKind;
  nestLabel: boolean;
  color: string | undefined;
}) {
  if (icon) {
    const Icon = icon;
    return <Icon />;
  }
  if (hideIndicator) return null;
  return (
    <div
      className={cn(
        "shrink-0 rounded-[2px] border-(--color-border) bg-(--color-bg)",
        {
          "h-2.5 w-2.5": indicator === "dot",
          "w-1": indicator === "line",
          "w-0 border-[1.5px] border-dashed bg-transparent": indicator === "dashed",
          "my-0.5": nestLabel && indicator === "dashed",
        },
      )}
      style={{ "--color-bg": color, "--color-border": color } as React.CSSProperties}
    />
  );
}

function ChartTooltipItemDetails({
  label,
  value,
  nestLabel,
  tooltipLabel,
}: {
  label: React.ReactNode;
  value: number | string | undefined;
  nestLabel: boolean;
  tooltipLabel: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-1 justify-between leading-none", nestLabel ? "items-end" : "items-center")}>
      <div className="grid gap-1.5">
        {nestLabel ? tooltipLabel : null}
        <span className="text-muted-foreground">{label}</span>
      </div>
      {value ? <span className="font-mono font-medium tabular-nums text-foreground">{value.toLocaleString()}</span> : null}
    </div>
  );
}

function ChartTooltipItemRow({
  itemConfig,
  indicator,
  hideIndicator,
  nestLabel,
  indicatorColor,
  tooltipLabel,
  itemName,
  itemValue,
  formatted,
  useFormatter,
}: {
  itemConfig: { icon?: React.ComponentType; label?: React.ReactNode } | undefined;
  indicator: ChartTooltipIndicatorKind;
  hideIndicator: boolean;
  nestLabel: boolean;
  indicatorColor: string | undefined;
  tooltipLabel: React.ReactNode;
  itemName: string | number | undefined;
  itemValue: number | string | undefined;
  formatted: React.ReactNode;
  useFormatter: boolean;
}) {
  if (useFormatter) return <>{formatted}</>;
  return (
    <>
      <ChartTooltipIndicator
        icon={itemConfig?.icon}
        hideIndicator={hideIndicator}
        indicator={indicator}
        nestLabel={nestLabel}
        color={indicatorColor}
      />
      <ChartTooltipItemDetails
        label={itemConfig?.label || itemName}
        value={itemValue}
        nestLabel={nestLabel}
        tooltipLabel={tooltipLabel}
      />
    </>
  );
}

const ChartTooltipContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof RechartsPrimitive.Tooltip> &
    React.ComponentProps<"div"> & {
      hideLabel?: boolean;
      hideIndicator?: boolean;
      indicator?: "line" | "dot" | "dashed";
      nameKey?: string;
      labelKey?: string;
    }
>(
  (
    {
      active,
      payload,
      className,
      indicator = "dot",
      hideLabel = false,
      hideIndicator = false,
      label,
      labelFormatter,
      labelClassName,
      formatter,
      color,
      nameKey,
      labelKey,
    },
    ref,
  ) => {
    const { config } = useChart();

    const tooltipLabel = React.useMemo(() => {
      if (hideLabel || !payload?.length) {
        return null;
      }

      const [item] = payload;
      const key = `${labelKey || item?.dataKey || item?.name || "value"}`;
      const itemConfig = getPayloadConfigFromPayload(config, item, key);
      const value =
        !labelKey && typeof label === "string"
          ? config[label as keyof typeof config]?.label || label
          : itemConfig?.label;

      if (labelFormatter) {
        return (
          <div className={cn("font-medium", labelClassName)}>{labelFormatter(value, payload)}</div>
        );
      }

      if (!value) {
        return null;
      }

      return <div className={cn("font-medium", labelClassName)}>{value}</div>;
    }, [label, labelFormatter, payload, hideLabel, labelClassName, config, labelKey]);

    if (!active || !payload?.length) {
      return null;
    }

    const nestLabel = payload.length === 1 && indicator !== "dot";

    return (
      <div
        ref={ref}
        className={cn(
          "grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl",
          className,
        )}
      >
        {!nestLabel ? tooltipLabel : null}
        <div className="grid gap-1.5">
          {payload
            .filter((item) => item.type !== "none")
            .map((item, index) => {
              const key = `${nameKey || item.name || item.dataKey || "value"}`;
              const itemConfig = getPayloadConfigFromPayload(config, item, key);
              const indicatorColor = color || item.payload.fill || item.color;

              const useFormatter = Boolean(formatter && item?.value !== undefined && item.name);
              const formatted = useFormatter
                ? formatter!(item.value, item.name, item, index, item.payload)
                : null;
              return (
                <div
                  key={item.dataKey}
                  className={cn(
                    "flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5 [&>svg]:text-muted-foreground",
                    indicator === "dot" && "items-center",
                  )}
                >
                  <ChartTooltipItemRow
                    itemConfig={itemConfig}
                    indicator={indicator}
                    hideIndicator={hideIndicator}
                    nestLabel={nestLabel}
                    indicatorColor={indicatorColor}
                    tooltipLabel={tooltipLabel}
                    itemName={item.name}
                    itemValue={item.value}
                    formatted={formatted}
                    useFormatter={useFormatter}
                  />
                </div>
              );
            })}
        </div>
      </div>
    );
  },
);
ChartTooltipContent.displayName = "ChartTooltip";

const ChartLegend = RechartsPrimitive.Legend;

const ChartLegendContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> &
    Pick<RechartsPrimitive.LegendProps, "payload" | "verticalAlign"> & {
      hideIcon?: boolean;
      nameKey?: string;
    }
>(({ className, hideIcon = false, payload, verticalAlign = "bottom", nameKey }, ref) => {
  const { config } = useChart();

  if (!payload?.length) {
    return null;
  }

  return (
    <div
      ref={ref}
      className={cn(
        "flex items-center justify-center gap-4",
        verticalAlign === "top" ? "pb-3" : "pt-3",
        className,
      )}
    >
      {payload
        .filter((item) => item.type !== "none")
        .map((item) => {
          const key = `${nameKey || item.dataKey || "value"}`;
          const itemConfig = getPayloadConfigFromPayload(config, item, key);

          return (
            <div
              key={item.value}
              className={cn(
                "flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-muted-foreground",
              )}
            >
              {itemConfig?.icon && !hideIcon ? (
                <itemConfig.icon />
              ) : (
                <ChartLegendColorSwatch color={item.color} />
              )}
              {itemConfig?.label}
            </div>
          );
        })}
    </div>
  );
});
ChartLegendContent.displayName = "ChartLegend";

// Helper to extract item config from a payload.
function getPayloadConfigFromPayload(config: ChartConfig, payload: unknown, key: string) {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }

  const payloadPayload =
    "payload" in payload && typeof payload.payload === "object" && payload.payload !== null
      ? payload.payload
      : undefined;

  let configLabelKey: string = key;

  if (key in payload && typeof payload[key as keyof typeof payload] === "string") {
    configLabelKey = payload[key as keyof typeof payload] as string;
  } else if (
    payloadPayload &&
    key in payloadPayload &&
    typeof payloadPayload[key as keyof typeof payloadPayload] === "string"
  ) {
    configLabelKey = payloadPayload[key as keyof typeof payloadPayload] as string;
  }

  return configLabelKey in config ? config[configLabelKey] : config[key as keyof typeof config];
}

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
};
