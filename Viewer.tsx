'use client';

import { HTMLProps, useEffect, useRef, useState } from 'react';
import { pdfjs, Document, Page } from 'react-pdf';
import { useInView } from 'react-intersection-observer';

import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

import { FieldType } from '@/types/postreview';

// Set up PDF worker globally
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
).toString();

const pdfOptions = {
    cMapUrl: '/cmaps/',
    standardFontDataUrl: '/standard_fonts/',
};

/**
 * Props for the PDF Viewer component
 */
interface ViewerProps extends HTMLProps<HTMLDivElement> {
    annotations: FieldType[];
    source: string;
    agreementNumber: string;
}

/**
 * Props for the lazy-rendered page component
 */
interface LazyPageProps {
    pageNumber: number;
    scale: number;
    onVisible: (page: number) => void;
}

/**
 * Lazily renders a PDF page only when it comes into view
 */
const LazyPage = ({ pageNumber, scale, onVisible }: LazyPageProps) => {
    const { ref, inView } = useInView({
        threshold: 0.4,
        triggerOnce: false,
        delay: 800,
        trackVisibility: true,
    });

    useEffect(() => {
        if (inView) onVisible(pageNumber);
    }, [inView, pageNumber, onVisible]);

    return (
        <div ref={ref} style={{ minHeight: `${scale * 100}vh`, position: 'relative' }}>
            {inView && (
                <Page
                    pageNumber={pageNumber}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    scale={scale}
                />
            )}
        </div>
    );
};

/**
 * A modern and performance-optimized PDF viewer with lazy page rendering, zoom, and current page tracking
 */
export default function Viewer({ source, annotations, agreementNumber, className, ...rest }: ViewerProps) {
    const [pdfFileUrl, setPdfFileUrl] = useState<string | null>(null);
    const [numPages, setNumPages] = useState<number | null>(null);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [zoom, setZoom] = useState<number>(1);
    const containerRef = useRef<HTMLDivElement | null>(null);

    /**
     * Fetches the PDF file from the given source and creates an object URL for react-pdf
     */
    useEffect(() => {
        const fetchPDF = async () => {
            try {
                const blob = await fetch(source).then(res => res.blob());
                const url = URL.createObjectURL(blob);
                setPdfFileUrl(url);
            } catch (error) {
                console.error('Failed to load PDF:', error);
            }
        };
        fetchPDF();
    }, [source]);

    /**
     * Sets the number of pages when the document is successfully loaded
     */
    const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
        setNumPages(numPages);
    };

    /**
     * Handles zoom level changes with clamping
     */
    const handleZoomChange = (delta: number) => {
        setZoom(prev => Math.max(0.5, Math.min(prev + delta * 0.1, 3)));
    };

    /**
     * Updates current page number when a page becomes visible in viewport
     */
    const handlePageVisible = (page: number) => {
        setCurrentPage(page);
    };

    return (
        <div {...rest} className={className}>
            {/* Top bar with pagination, zoom and agreement info */}
            <div className="border-b flex flex-wrap gap-4 justify-between p-3 text-sm md:text-base">
                <div className="flex items-center gap-2">
                    <span className="font-semibold">Page:</span>
                    <span>{currentPage} / {numPages ?? 'Loading...'}</span>
                </div>
                <div className="flex items-center gap-2">
                    <span>Zoom: {(zoom * 100).toFixed(0)}%</span>
                    <button
                        onClick={() => handleZoomChange(1)}
                        className="px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded"
                        aria-label="Zoom in"
                    >+
                    </button>
                    <button
                        onClick={() => handleZoomChange(-1)}
                        className="px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded"
                        aria-label="Zoom out"
                    >-
                    </button>
                </div>
                <div className="flex items-center gap-2">
                    <span className="font-semibold">Agreement No:</span>
                    <span className="text-purple-700 font-medium">{agreementNumber}</span>
                </div>
            </div>

            {/* PDF container */}
            <div
                ref={containerRef}
                className="h-[80vh] overflow-y-auto relative border border-gray-300 bg-white"
            >
                {pdfFileUrl && (
                    <Document
                        file={pdfFileUrl}
                        onLoadSuccess={onDocumentLoadSuccess}
                        options={pdfOptions}
                        loading={<div className="p-8 text-center text-gray-500">Loading PDF...</div>}
                    >
                        {numPages &&
                            Array.from({ length: numPages }, (_, i) => (
                                <LazyPage
                                    key={`page_${i + 1}`}
                                    pageNumber={i + 1}
                                    scale={zoom}
                                    onVisible={handlePageVisible}
                                />
                            ))}
                    </Document>
                )}
            </div>
        </div>
    );
}
