import { colors } from '@/colors';
import { Bar, Doughnut, Pie } from 'react-chartjs-2';
import { t } from '@lingui/macro';
import { i18n } from '@lingui/core';
import _ from 'lodash';
import { ChartType } from '@/_pages/hcp/statistics/ui/DemographyDetails';
import { useMemo } from 'react';
import { Chart as ChartJS, ArcElement, BarElement, LinearScale, CategoryScale, Legend, Tooltip, Title } from 'chart.js';
import { demographyDetailsLoaderQuery } from '@/_pages/hcp/statistics';

export type aggregatedData = { [index: string]: number };

ChartJS.register(ArcElement, BarElement, LinearScale, CategoryScale, Title, Tooltip, Legend);

export function AggregatedTableChart({
                                         type,
                                         item,
                                     }: {
    type: ChartType;
    item: demographyDetailsLoaderQuery['response']['statisticsDemographyDetails'][0];
}) {
    switch (type) {
        case 'pie':
            return (
                <div className="h-64">
                    <AggregatedPie data={aggregatedData(item)} />
                </div>
            );
        case 'bar':
            return (
                <div className="h-64 w-full">
                    <AggregatedBar data={aggregatedData(item)} />
                </div>
            );
        case 'multiple-doughnuts':
            return <AggregatedMultipleDoughnuts data={aggregatedData(item)} />;
        default:
            return <div></div>;
    }
}

function aggregatedData(
    item: demographyDetailsLoaderQuery['response']['statisticsDemographyDetails'][0]
): aggregatedData {
    const aggregated = _.countBy(item.table.rows);

    // Sort data.
    let sorted: aggregatedData = {};

    let template = {};
    switch (item.label) {
        case 'statistics.demography.age.title':
            _(aggregated)
                .keys()
                .sort()
                .each((key) => {
                    sorted[key] = aggregated[key];
                });
            template = { 'Under 20': 0 };
            sorted = { ...template, ...sorted };
            break;
        case 'statistics.demography.work.title':
            template = {
                'Full time work': 0,
                'Part-time work': 0,
                'Full time student': 0,
                'Part-time student': 0,
                'School student': 0,
                Homemaker: 0,
                Pensioner: 0,
                'Disability benefits': 0,
                'Seeking employment': 0,
                'Work assessment allowance (AAP)': 0,
                'Other NAV-benefits': 0,
                'Military service': 0,
                'Temporarily laid off': 0,
            };
            const customSort: aggregatedData = { ...template, ...aggregated };
            const descending = _(customSort).toPairs().orderBy([1], ['desc']).fromPairs().value();
            sorted = descending;
            break;
        default:
            return aggregated;
    }

    // Remove items in template that do not exist in original aggregated data.
    for (const key in sorted) {
        if (!(key in aggregated)) delete sorted[key];
    }
    return sorted;
}

function deAcronymLabels(label: string) {
    switch (label) {
        case 'M':
            return 'Men';
        case 'W':
            return 'Women';
        case 'N':
            return 'Neutral';
        case 'Work assessment allowance (AAP)':
            return 'AAP';
        default:
            return label;
    }
}

function getLabelsAndValues(data: aggregatedData) {
    const labelsArr = _.keys(data);
    const valuesArr = _.values(data);

    const fixMWN = labelsArr.map((label) => {
        return deAcronymLabels(label);
    });

    const translatedLabels = fixMWN.map((label) => i18n._(label));

    return { labelsArr: translatedLabels, valuesArr };
}

function AggregatedPie({ data }: { data: aggregatedData }) {
    const { labelsArr, valuesArr } = getLabelsAndValues(data);
    const chartData = {
        labels: labelsArr,
        datasets: [
            {
                data: valuesArr,
                backgroundColor: [colors.chart.dark, colors.chart.light, colors.chart.gray],
                borderWidth: 0,
            },
        ],
    };
    return (
        <Pie
            aria-label={t`Chart`}
            role="img"
            data={chartData}
            options={{
                plugins: {
                    tooltip: {
                        displayColors: false,
                    },
                },
            }}
        />
    );
}

function AggregatedBar({ data }: { data: aggregatedData }) {
    const { labelsArr, valuesArr } = getLabelsAndValues(data);
    const chartData = {
        labels: labelsArr,
        datasets: [
            {
                data: valuesArr,
                backgroundColor: [colors.chart.light],
                borderRadius: 8,
                borderWidth: 0,
                categoryPercentage: 0.5,
            },
        ],
    };

    return (
        <Bar
            aria-label={t`Chart`}
            role="img"
            data={chartData}
            options={{
                maintainAspectRatio: false,
                indexAxis: 'y',
                scales: {
                    x: {
                        border: { display: false },
                        grid: { display: false },
                        ticks: { display: false },
                    },
                    y: {
                        border: { display: false },
                        grid: { display: false },
                    },
                },
                plugins: {
                    legend: { display: false },
                    tooltip: { displayColors: false },
                },
            }}
        />
    );
}

export function AggregatedMultipleDoughnuts({ data }: { data: aggregatedData }) {
    const { valuesArr } = getLabelsAndValues(data);
    const total = _.sum(valuesArr);
    let doughnutsRemaining = Object.keys(data).length;
    const oddDoughnuts = doughnutsRemaining % 2;
    return (
        <div className="grid grid-cols-2 gap-4">
            {_.map(data, (value, key) => {
                return (
                    <div
                        key={`${key}-${value}-${total}`}
                        className={oddDoughnuts && doughnutsRemaining-- === 1 ? 'col-span-2' : ''}
                    >
                        <AggregatedDoughnut title={key} value={value} total={total} />
                    </div>
                );
            })}
        </div>
    );
}

const doughnutOptions = {
    plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
    },
};

function AggregatedDoughnut({ title, value, total }: { title: string; value: number; total: number }) {
    const chartData = useMemo(
        () => ({
            labels: [title, t`Others`],
            datasets: [
                {
                    data: [value, total - value],
                    backgroundColor: [colors.chart.dark, colors.chart.gray],
                    borderWidth: 0,
                    borderRadius: 4,
                    cutout: '70%',
                    radius: '70%',
                },
            ],
        }),
        [value, title, total]
    );

    const plugins = useMemo(
        () => [
            {
                id: 'text',
                beforeDraw: function (chart: { width: any; height: any; ctx: any }) {
                    const width = chart.width,
                        height = chart.height,
                        ctx = chart.ctx;

                    ctx.restore();
                    const fontSize = (height / 100).toFixed(2);
                    ctx.font = fontSize + 'em sans-serif';
                    ctx.textBaseline = 'middle';

                    const text = ((value / total) * 100).toFixed(1).replace(/[.,]0$/, '') + '%',
                        textX = Math.round((width - ctx.measureText(text).width) / 2),
                        textY = height / 2;

                    ctx.fillText(text, textX, textY);
                    ctx.save();
                },
            },
        ],
        [value, total]
    );

    return (
        <>
            <div className="flex h-20 justify-center">
                <Doughnut aria-label={t`Chart`} role="img" data={chartData} options={doughnutOptions} plugins={plugins} />
            </div>
            <div className="text-center text-sm">{i18n._(deAcronymLabels(title))}</div>
        </>
    );
}
