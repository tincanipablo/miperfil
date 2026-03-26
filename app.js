const { createElement } = React;

// Componente para la tarjeta de etnia con el marcador de color
const EthnicityCard = ({ region, percentage, color }) => {
    return createElement('div', { className: 'ethnicity-card' },
        createElement('div', { className: 'header-group' },
            createElement('div', { className: 'region-info' },
                // Aquí usamos el color en lugar de una imagen
                createElement('span', { 
                    className: 'color-marker', 
                    style: { backgroundColor: color } 
                }),
                createElement('span', { className: 'region-name' }, region)
            ),
            createElement('span', { className: 'percentage' }, `${percentage}%`)
        ),
        createElement('div', { className: 'progress-bar' },
            createElement('div', { 
                className: 'progress-fill', 
                style: { width: `${percentage}%` } 
            })
        )
    );
};

const App = () => {
    // Datos actualizados con colores específicos para cada etnia
    const myData = [
        { region: "Ibérico", percentage: 45.2, color: "#FF5733" }, // Naranja
        { region: "Italiano", percentage: 22.1, color: "#33FF57" }, // Verde
        { region: "Mesoamericano y Andino", percentage: 18.5, color: "#3357FF" }, // Azul
        { region: "Sefardí", percentage: 8.2, color: "#F1C40F" }, // Amarillo
        { region: "Otros", percentage: 6.0, color: "#8E44AD" }  // Morado
    ];

    return createElement('div', { className: 'container' },
        createElement('h1', null, "Mi Composición Étnica"),
        myData.map((item, idx) => 
            createElement(EthnicityCard, { 
                key: idx, 
                region: item.region, 
                percentage: item.percentage,
                color: item.color
            })
        )
    );
};

// Renderizado final
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(createElement(App));