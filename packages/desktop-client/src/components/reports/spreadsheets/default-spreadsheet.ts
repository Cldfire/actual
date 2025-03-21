import * as d from 'date-fns';

import { runQuery } from 'loot-core/src/client/query-helpers';
import { send } from 'loot-core/src/platform/client/fetch';
import * as monthUtils from 'loot-core/src/shared/months';
import { integerToAmount } from 'loot-core/src/shared/util';
import {
  type AccountEntity,
  type PayeeEntity,
  type CategoryEntity,
  type RuleConditionEntity,
  type CategoryGroupEntity,
} from 'loot-core/src/types/models';

import { categoryLists, groupBySelections } from '../ReportOptions';

import calculateLegend from './calculateLegend';
import filterHiddenItems from './filterHiddenItems';
import makeQuery from './makeQuery';
import recalculate from './recalculate';

export type createSpreadsheetProps = {
  startDate: string;
  endDate: string;
  categories: { list: CategoryEntity[]; grouped: CategoryGroupEntity[] };
  selectedCategories: CategoryEntity[];
  conditions: RuleConditionEntity[];
  conditionsOp: string;
  showEmpty: boolean;
  showOffBudgetHidden: boolean;
  showUncategorized: boolean;
  groupBy?: string;
  balanceTypeOp?: string;
  payees?: PayeeEntity[];
  accounts?: AccountEntity[];
  setDataCheck?: (value: boolean) => void;
  graphType: string;
};

export default function createSpreadsheet({
  startDate,
  endDate,
  categories,
  selectedCategories,
  conditions = [],
  conditionsOp,
  showEmpty,
  showOffBudgetHidden,
  showUncategorized,
  groupBy,
  balanceTypeOp,
  payees,
  accounts,
  setDataCheck,
  graphType,
}: createSpreadsheetProps) {
  const [categoryList, categoryGroup] = categoryLists(
    showOffBudgetHidden,
    showUncategorized,
    categories,
  );

  const categoryFilter = (categoryList || []).filter(
    category =>
      !category.hidden &&
      selectedCategories &&
      selectedCategories.some(
        selectedCategory => selectedCategory.id === category.id,
      ),
  );

  const [groupByList, groupByLabel] = groupBySelections(
    groupBy,
    categoryList,
    categoryGroup,
    payees,
    accounts,
  );

  return async (spreadsheet, setData) => {
    if (groupByList.length === 0) {
      return null;
    }

    const { filters } = await send('make-filters-from-conditions', {
      conditions: conditions.filter(cond => !cond.customName),
    });
    const conditionsOpKey = conditionsOp === 'or' ? '$or' : '$and';

    const [assets, debts] = await Promise.all([
      runQuery(
        makeQuery(
          'assets',
          startDate,
          endDate,
          showOffBudgetHidden,
          selectedCategories,
          categoryFilter,
          conditionsOpKey,
          filters,
        ),
      ).then(({ data }) => data),
      runQuery(
        makeQuery(
          'debts',
          startDate,
          endDate,
          showOffBudgetHidden,
          selectedCategories,
          categoryFilter,
          conditionsOpKey,
          filters,
        ),
      ).then(({ data }) => data),
    ]);

    const months = monthUtils.rangeInclusive(startDate, endDate);

    let totalAssets = 0;
    let totalDebts = 0;

    const monthData = months.reduce((arr, month) => {
      let perMonthAssets = 0;
      let perMonthDebts = 0;
      const stacked = {};

      groupByList.map(item => {
        let stackAmounts = 0;

        const monthAssets = filterHiddenItems(item, assets)
          .filter(
            asset => asset.date === month && asset[groupByLabel] === item.id,
          )
          .reduce((a, v) => (a = a + v.amount), 0);
        perMonthAssets += monthAssets;

        const monthDebts = filterHiddenItems(item, debts)
          .filter(debt => debt.date === month && debt[groupByLabel] === item.id)
          .reduce((a, v) => (a = a + v.amount), 0);
        perMonthDebts += monthDebts;

        if (balanceTypeOp === 'totalAssets') {
          stackAmounts += monthAssets;
        }
        if (balanceTypeOp === 'totalDebts') {
          stackAmounts += monthDebts;
        }
        if (stackAmounts !== 0) {
          stacked[item.name] = integerToAmount(Math.abs(stackAmounts));
        }

        return null;
      });
      totalAssets += perMonthAssets;
      totalDebts += perMonthDebts;

      arr.push({
        // eslint-disable-next-line rulesdir/typography
        date: d.format(d.parseISO(`${month}-01`), "MMM ''yy"),
        ...stacked,
        totalDebts: integerToAmount(perMonthDebts),
        totalAssets: integerToAmount(perMonthAssets),
        totalTotals: integerToAmount(perMonthDebts + perMonthAssets),
      });

      return arr;
    }, []);

    const calcData = groupByList.map(item => {
      const calc = recalculate({ item, months, assets, debts, groupByLabel });
      return { ...calc };
    });
    const calcDataFiltered = calcData.filter(i =>
      !showEmpty ? i[balanceTypeOp] !== 0 : true,
    );

    const legend = calculateLegend(
      monthData,
      calcDataFiltered,
      groupBy,
      graphType,
      balanceTypeOp,
    );

    setData({
      data: calcDataFiltered,
      monthData,
      legend,
      startDate,
      endDate,
      totalDebts: integerToAmount(totalDebts),
      totalAssets: integerToAmount(totalAssets),
      totalTotals: integerToAmount(totalAssets + totalDebts),
    });
    setDataCheck?.(true);
  };
}
