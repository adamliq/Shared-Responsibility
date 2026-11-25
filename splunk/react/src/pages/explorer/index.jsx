import React from 'react';
import layout from '@splunk/react-page/18';
import { getUserTheme } from '@splunk/splunk-utils/themes';
import App from '../../App';

getUserTheme()
    .then((theme) => {
        layout(<App />, { theme, pageTitle: 'Shared Responsibility Explorer' });
    })
    .catch((e) => {
        const errorEl = document.createElement('span');
        errorEl.textContent = String(e);
        document.body.appendChild(errorEl);
    });
