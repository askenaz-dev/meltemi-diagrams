-- The project a takedown removed a publication from (change cloud review, spec publishing,
-- "Takedown"): a takedown was kept by handle and slug alone, so whoever took the handle later,
-- with an account older than the takedown, was shown the removal of a page they never published.
-- The owner's dialog lists the takedowns of its own project and nothing else.
--
-- A project id is a random identifier of no person, so keeping it in the service's record of a
-- takedown holds nothing about whoever owned the project. NULL for a row written before this
-- column, which no project matches, so it is shown to no one.
ALTER TABLE takedowns ADD COLUMN project_id TEXT;
