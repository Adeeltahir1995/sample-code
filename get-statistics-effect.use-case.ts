import _ from 'lodash';
import { Injectable } from '@nestjs/common';
import { GAD_PHQ_NIDS } from '@/common/constants';
import { StatisticEffect } from '@/common/entities';
import { StatisticsRepository } from '@/database/repositories';
import { StatisticsService } from '@/statistics/statistics.service';
import { StatisticsFilterInput } from '@/statistics-api/args/statistics.args';
import { PatientDateFilterTypeEnum } from '@/statistics/enums';
import { formatDatesForChartLabels, getDatesForRange } from '../utils/periods';
import { AuthUser } from '@/common/decorators/gql-context.decorator';

@Injectable()
export class GetStatisticsEffectUseCase {
    constructor(
        private readonly statisticsService: StatisticsService,
        private readonly statisticsRepository: StatisticsRepository,
    ) {}

    async execute(
        input: StatisticsFilterInput,
        user: Pick<AuthUser, 'isCustomersAdmin'>,
    ): Promise<StatisticEffect> {
        const { customers, excludedCodes } = await this.statisticsService.prepareStatisticsContext(
            input,
        );
        const { currentTimeFrame } = this.statisticsService.prepareTimeFrames(input);

        const effects = await this.statisticsRepository.getEffects(
            customers,
            {
                dateFilterType: PatientDateFilterTypeEnum.REFERRAL_DATE,
                dateFrom: currentTimeFrame.start,
                dateTo: currentTimeFrame.end,
                excludedCodes,
                genders: input.genders,
                ageRanges: input.ageRanges,
                occupations: input.occupations,
                interventions: input.interventions,
                status: input.status,
                toolNodeIds: input.toolNodeIds,
                dischargeReasons: input.dischargeReasons,
            },
            GAD_PHQ_NIDS,
            input.periodicity,
            { includePatients: user.isCustomersAdmin },
        );

        const effectDataGroupedByPeriod = _.mapValues(
            _.groupBy(effects, (effect) => effect.period),
            (groupedEffects) => this.getEffectsData(groupedEffects),
        );
        const rangeDates = getDatesForRange(input.periodicity, input.dateFrom, input.dateTo);
        const labels = formatDatesForChartLabels(rangeDates, input.periodicity);

        const recoveryRateData = rangeDates.map(
            (period) => effectDataGroupedByPeriod[period]?.recoveryRate ?? 0,
        );
        const reliablyImprovedData = rangeDates.map(
            (period) => effectDataGroupedByPeriod[period]?.reliablyImproved ?? 0,
        );
        const chart = {
            labels,
            datasets: [
                { label: 'Recovery Rate', data: recoveryRateData },
                { label: 'Reliably Improved', data: reliablyImprovedData },
            ],
        };

        if (user.isCustomersAdmin) {
            const patients = effects
                .filter((e) => e.code && e.patientId)
                .map((e) => ({ code: e.code as string, patientId: e.patientId as number }));

            return { chart, patients };
        }

        return { chart, patients: [] };
    }

    private getEffectsData(
        effects: Awaited<ReturnType<typeof this.statisticsRepository.getEffects>>,
    ) {
        const effectsWithCaseness = effects.filter((effect) => Number(effect.caseness));
        const countCaseness = effectsWithCaseness.length;
        const countRecovered = effectsWithCaseness.filter((effect) => Number(effect.recovered)).length;
        const countReliablyImproved = effectsWithCaseness.filter((effect) =>
            Number(effect.reliablyimproved),
        ).length;
        const recoveryRate = countCaseness > 0 ? Math.ceil((countRecovered / countCaseness) * 100) : 0;
        const reliablyImproved =
            countCaseness > 0 ? Math.ceil((countReliablyImproved / countCaseness) * 100) : 0;
        return {
            recoveryRate,
            reliablyImproved,
        };
    }
}
