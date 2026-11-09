'use strict';
// The climate sources, the indicator pairs and the dictionary vocabulary the service speaks. This is the service-side
// twin of config/indicators.js in the indicator-pair-scatterplots repository: the state → data mapping.
//
// A climate block of a Scatter* document sits at properties.<src>.<period> for a reference period and at
// properties.<src>.<period>.<rcp> (EU-Trees4F) or properties.<src>.<period>.<model>.<ssp> (WorldClim, CHELSA) for a
// future one; the 1 km grids (WorldClim, Chelsa collections) nest their futures as properties.<period>.<model>.<ssp>.

const SOURCES = {
    eutrees4f: {
        code: 'EU-TREES4F_PREDICTORS_2022', section: 'worldclim14', period: '1961-1990',
        future: { periods: ['1991-2020', '2021-2050', '2051-2080'], scenarios: ['rcp45', 'rcp85'] },
        grid: null,   // no 1 km grid: EU-Trees4F values exist for surveyed cells only (10 km rasters sampled at load)
    },
    worldclim: {
        code: 'WORLDCLIM_V2.1', section: 'worldclim21', period: '1970-2000',
        future: { periods: ['2021-2040', '2041-2060', '2061-2080', '2081-2100'], model: 'MPI-ESM1-2-HR', ssp: 'ssp370', tasApprox: true },
        grid: 'WorldClim',
    },
    chelsa: {
        code: 'CHELSA_V2.1', section: 'chelsa', period: '1981-2010',
        future: { periods: ['2011-2040', '2041-2070', '2071-2100'], model: 'MPI-ESM1-2-HR', ssp: 'ssp370' },
        grid: 'Chelsa',
    },
};

// The axes offered, X and Y, and the pairing suggested once when X changes (decided 2026-11-09).
const AXES = {
    X: ['env_climate_bio01', 'env_climate_tas_summer', 'env_climate_continentality', 'env_climate_srad_spring-summer', 'env_climate_pr_seasonality-ratio'],
    Y: ['env_climate_bio12', 'env_climate_pr_summer', 'env_climate_pr_winter', 'env_climate_tas_coldest', 'env_climate_bio14'],
};
const PAIRS = [
    { key: 'P1', x: 'env_climate_bio01', y: 'env_climate_bio12' },
    { key: 'P2', x: 'env_climate_tas_summer', y: 'env_climate_pr_summer' },
    { key: 'P3', x: 'env_climate_continentality', y: 'env_climate_pr_winter' },
    { key: 'P4', x: 'env_climate_srad_spring-summer', y: 'env_climate_tas_coldest' },
    { key: 'P5', x: 'env_climate_pr_seasonality-ratio', y: 'env_climate_bio14' },
];

// The dictionary terms used as keys and values.
const K = {
    dataset: 'std_dataset_ids', period: 'env_climate_period', scenario: 'env_climate_scenario',
    X: 'ui_layout_scatterplot_X', Y: 'ui_layout_scatterplot_Y', species: 'species', country: 'gcu_id_country', unit: 'gcu_id_number',
    level: 'gcu_loc_coordinates-restriction_level', selection: 'ui_layout_map_selection', variant: 'ui_layout_scatterplot_view_classes_variant',
};
const LEVELS = ['gcu_loc_coordinates-restriction_public', 'gcu_loc_coordinates-restriction_value', 'gcu_loc_coordinates-restriction_manage'];
const VARIANTS = { 'ui_layout_scatterplot_view_classes_variant_potential': 'pot', 'ui_layout_scatterplot_view_classes_variant_dispersal': 'disp' };
const periodGid = (src, period) => `env_climate_period_${SOURCES[src].section}_${period}`;
const scenarioGid = (scenario) => `env_climate_scenario_${scenario || 'historical'}`;

module.exports = { SOURCES, AXES, PAIRS, K, LEVELS, VARIANTS, periodGid, scenarioGid };
