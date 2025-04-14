import dayjs from 'dayjs';
import type { Meta, StoryObj } from '@storybook/react';
import { Provider as ReduxProvider } from 'react-redux';
import { OperationDescriptor, RelayEnvironmentProvider } from 'react-relay';
import { MockPayloadGenerator } from 'relay-test-utils';
import useRelayMockEnvironment from '@/utils/useRelayMockEnvironment';

import licensesUsedMock from '@/../mocks/licenses-used.json';
import summaryMock from '@/../mocks/summary.json';
import distributionMock from '@/../mocks/distribution.json';
import effectMock from '@/../mocks/effect.json';
import employeesMock from '@/../mocks/employees.json';
import interventionsMock from '@/../mocks/interventions.json';
import referralsMock from '@/../mocks/referrals.json';

import { setCustomerOptions, setFilters } from '@/features/statistics/filters/model/statistics.slice';

import { createStore } from '@/reduxStore';
import { mockUser } from '@/reduxStore/stateMocks';
import { UserRole } from '@/types/user-role';

import { mockDemographyDetailsQuery, mockEffectDetailsQuery } from '../api/__mocks__';
import { EFFECT_DETAILS_QUERY } from '../api/effectDetailsLoader';
import { StatisticsGrid } from './StatisticsGrid';
import { effectDetailsLoaderQuery$variables } from '../api/__generated__/effectDetailsLoaderQuery.graphql';
import { STATISTICS_FILTERS_QUERY } from '@/features/statistics/filters/api/statisticsFiltersLoader';
import { getFilterTimeFrames } from '@/features/statistics/filters/model/FilterTimeFrameItem';
import { PATIENT_DISCHARGE_REASONS_QUERY } from '@/features/statistics/filters/api/dischargeReasonsLoader';
import { mockCustomers, mockDischargeReasons } from '@/features/statistics/filters/api/__mocks__';

Date.now = () => new Date('2025-04-07T12:00:00.000Z').getTime();

const customers = [
    {
        customerId: '1',
        title: 'Customer 1',
    },
    {
        customerId: '2',
        title: 'Customer 2',
    },
];

const period = getFilterTimeFrames()[5].toObject();

// More on how to set up stories at: https://storybook.js.org/docs/react/writing-stories/introduction#default-export
const meta: Meta<typeof StatisticsGrid> = {
    title: 'Pages/Statistics',
    component: StatisticsGrid,
    parameters: {
        chromatic: { delay: 10000 },
        docs: {
            story: {
                inline: true,
            },
        },
        nextjs: {
            appDirectory: true,
            navigation: {
                query: {
                    period: '01.08.2023-05.08.2023',
                },
            },
        },
    },
    decorators: [
        (Story, context) => {
            const environment = useRelayMockEnvironment();

            const resolver = (operation: OperationDescriptor) => {
                switch (operation.request.node.operation.name) {
                    case 'demographyDetailsLoaderQuery':
                        return mockDemographyDetailsQuery;
                    case 'dischargeReasonsLoaderQuery':
                        return { data: { patientsDischargeReasons: mockDischargeReasons() } };
                    case 'effectDetailsLoaderQuery':
                        return mockEffectDetailsQuery;
                    case 'statisticsFiltersLoaderQuery':
                        return { data: { customer: mockCustomers()[0] } };
                    default:
                        return MockPayloadGenerator.generate(operation, {
                            Statistic: () => ({
                                referrals: referralsMock,
                                distribution: distributionMock,
                                interventions: interventionsMock,
                                effect: effectMock,
                                licensesUsed: licensesUsedMock,
                                employees: employeesMock,
                                summary: summaryMock,
                            }),
                        });
                }
            };

            // resolve for all queries
            for (let i = 0; i < 20; i++) {
                environment.mock.queueOperationResolver((operation) => resolver(operation));
            }

            const dateFrom = dayjs(period.start).startOf('day').toISOString();
            const dateTo = dayjs(period.end).endOf('day').toISOString();
            const effectDetailsVariables: effectDetailsLoaderQuery$variables = {
                customerId: '1',
                input: {
                    ageRanges: [],
                    dateFrom,
                    dateTo,
                    compareFrom: '2023-07-26T22:00:00.000Z',
                    compareTo: '2023-07-31T21:59:59.999Z',
                    dischargeReasons: [],
                    genders: [],
                    interventions: [],
                    occupations: [],
                    periodicity: 'MONTHLY',
                    status: [],
                    toolNodeIds: [],
                },
            };
            // required for usePreloadedQuery - https://relay.dev/docs/guides/testing-relay-with-preloaded-queries/
            environment.mock.queuePendingOperation(EFFECT_DETAILS_QUERY, effectDetailsVariables);
            environment.mock.queuePendingOperation(PATIENT_DISCHARGE_REASONS_QUERY, {});
            environment.mock.queuePendingOperation(STATISTICS_FILTERS_QUERY, {
                customerId: 1,
                toolsFilterInput: { dateFrom, dateTo },
            });

            const store = createStore(mockUser([UserRole.admin]), 'en', {
                isFiltersEnabled: true,
                isDownloadButtonEnabled: true,
            });
            store.dispatch(
                setCustomerOptions(customers.map((customer) => ({ customerId: customer.customerId, title: customer.title })))
            );
            store.dispatch(
                setFilters({ ...store.getState().statisticsSlice.filters, customerId: customers[0].customerId, period })
            );

            return (
                <ReduxProvider store={store}>
                    <RelayEnvironmentProvider environment={environment}>
                        <Story />
                    </RelayEnvironmentProvider>
                </ReduxProvider>
            );
        },
    ],
    // More on argTypes: https://storybook.js.org/docs/react/api/argtypes
    argTypes: {},
};

export default meta;
type Story = StoryObj<typeof meta>;

// More on writing stories with args: https://storybook.js.org/docs/react/writing-stories/args
export const Primary: Story = {};
