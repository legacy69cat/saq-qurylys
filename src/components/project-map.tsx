"use client";
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
export type MapProject = {
    id: string;
    name: string;
    address: string;
    latitude: number | null;
    longitude: number | null;
    score: number;
    zone: string;
    needsReview: boolean;
};
export function ProjectMap({ projects, preview = false }: {
    projects: MapProject[];
    preview?: boolean;
}) {
    const element = useRef<HTMLDivElement>(null);
    const [error, setError] = useState(false);
    useEffect(() => {
        let cancelled = false;
        let map: LeafletMap | undefined;
        let observer: ResizeObserver | undefined;
        void import("leaflet").then(L => {
            if (cancelled || !element.current)
                return;
            map = L.map(element.current, { scrollWheelZoom: false }).setView([49.948, 82.628], 12);
            const tile = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
            tile.on('tileerror', () => { if (!cancelled)
                setError(true); });
            tile.on('tileload', () => { if (!cancelled)
                setError(false); });
            const points: [
                number,
                number
            ][] = [];
            for (const p of projects) {
                if (p.latitude === null || p.longitude === null)
                    continue;
                const point: [
                    number,
                    number
                ] = [p.latitude, p.longitude];
                points.push(point);
                const icon = document.createElement('span');
                icon.className = `map-pin ${p.score === 0 && p.needsReview ? 'unknown' : p.zone}`;
                icon.textContent = String(p.score);
                const popup = document.createElement('div');
                const title = document.createElement('strong');
                title.textContent = p.name;
                const address = document.createElement('p');
                address.textContent = p.address;
                const score = document.createElement('p');
                score.textContent = `${p.score} / 100${p.needsReview ? ' · Нужна проверка' : ''}`;
                const link = document.createElement('a');
                link.href = `/projects/${encodeURIComponent(p.id)}`;
                link.textContent = 'Открыть карточку →';
                popup.append(title, address);
                if (!preview)
                    popup.append(score, link);
                L.marker(point, { icon: L.divIcon({ html: icon, className: 'project-marker', iconSize: [38, 38], iconAnchor: [19, 19] }), title: p.name, alt: p.name }).addTo(map).bindPopup(popup);
            }
            if (points.length)
                map.fitBounds(L.latLngBounds(points), { padding: [35, 35], maxZoom: 14 });
            observer = new ResizeObserver(() => map?.invalidateSize());
            observer.observe(element.current);
        }).catch(() => { if (!cancelled)
            setError(true); });
        return () => { cancelled = true; observer?.disconnect(); map?.remove(); };
    }, [projects, preview]);
    return <div className="map-shell"><div ref={element} className="project-map" role="region" aria-label="Карта строящихся объектов"/>{error ? <p className="map-error" role="status">Подложка карты недоступна. Карточки объектов доступны в списке.</p> : null}<div className="map-legend"><span><i className="risk-dot unknown"/>Не проверено</span><span><i className="risk-dot green"/>0–24</span><span><i className="risk-dot yellow"/>25+</span><span><i className="risk-dot red"/>60+ и R1+R2</span></div></div>;
}
