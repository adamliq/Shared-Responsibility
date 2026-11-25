import styled from 'styled-components';
import { variables } from '@splunk/themes';

export const PARTY_COLORS = { csc: '#f59e0b', customer_soc: '#20c77a', csp: '#0794d2', third_party: '#9b6cff' };
export const SHARE_PARTIES = [
    { key: 'csc', field: 'customer_pct', label: 'Customer governance' },
    { key: 'customer_soc', field: 'soc_pct', label: 'Customer SOC' },
    { key: 'csp', field: 'provider_pct', label: 'Cloud provider' },
];

export const Page = styled.div`
    padding: ${variables.spacingLarge};
    color: ${variables.contentColorDefault};
    background: ${variables.backgroundColorPage};
    min-height: 100vh;
    box-sizing: border-box;
`;
export const Lead = styled.p`
    color: ${variables.contentColorMuted};
    margin: 0 0 ${variables.spacingMedium};
    max-width: 900px;
`;
export const Toolbar = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: ${variables.spacingSmall};
    align-items: flex-end;
    margin: ${variables.spacingMedium} 0;
`;
export const Field = styled.label`
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: ${variables.fontSizeSmall};
    color: ${variables.contentColorMuted};
    min-width: ${(p) => p.$width || 180}px;
`;
export const Split = styled.div`
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
    gap: ${variables.spacingLarge};
    align-items: start;
    @media (max-width: 1100px) {
        grid-template-columns: 1fr;
    }
`;
export const Panel = styled.section`
    background: ${variables.backgroundColorSection};
    border: 1px solid ${variables.borderColorWeak};
    border-radius: ${variables.borderRadius};
    padding: ${variables.spacingMedium};
    overflow: auto;
`;
export const Muted = styled.span`
    color: ${variables.contentColorMuted};
`;
export const Stat = styled.div`
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: ${variables.spacingSmall};
    margin: ${variables.spacingMedium} 0;
    & > div {
        border: 1px solid ${variables.borderColorWeak};
        border-radius: ${variables.borderRadius};
        padding: ${variables.spacingSmall};
    }
    & strong {
        display: block;
        font-size: ${variables.fontSizeXLarge};
    }
`;
export const Mono = styled.pre`
    font-family: ${variables.monoFontFamily};
    font-size: ${variables.fontSizeSmall};
    white-space: pre-wrap;
    margin: 0;
`;
export const Grid2 = styled.dl`
    display: grid;
    grid-template-columns: 180px 1fr;
    gap: 6px 14px;
    margin: 0;
    & dt {
        color: ${variables.contentColorMuted};
        font-size: ${variables.fontSizeSmall};
    }
    & dd {
        margin: 0;
    }
`;
