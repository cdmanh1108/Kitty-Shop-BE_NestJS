# Catalog search baseline

Measured on 2026-10-08 against the local PostgreSQL database with read-only
`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` runs. Each query ran 16 times; the
reported median and p95 use PostgreSQL execution time from sequential runs on a
warm local database. Search text was derived from an existing product name and
is omitted.

The selected shop had 119 products, 124 variants, and 119 inventory items.

| Query shape                                                                |   Median |      p95 | Observed plan                                                      |
| -------------------------------------------------------------------------- | -------: | -------: | ------------------------------------------------------------------ |
| Admin product search by name, code, or variant SKU                         | 0.138 ms | 0.205 ms | Sequential scans of the small product, variant, and inventory sets |
| Storefront catalog search by name, code, or description                    | 0.097 ms | 0.103 ms | Sequential scan of the small product set                           |
| Admin inventory search by SKU, barcode, product code/name, or variant code | 0.246 ms | 0.308 ms | Sequential scans of inventory, variant, and product sets           |

Existing indexes include the product-name trigram index and shop-scoped unique
indexes for product codes, variant codes, inventory SKUs, and barcodes. The
planner chose sequential scans for the measured search shapes at this data size.
No new catalog index was added: the local catalog is too small to demonstrate an
index benefit. Repeat these measurements with production-sized, accurately
analyzed data before adding trigram indexes for product codes/descriptions or
inventory substring search.

These are database execution times, not API latency. They do not include NestJS,
network, serialization, or storefront image work, and should not be treated as a
production latency target.
