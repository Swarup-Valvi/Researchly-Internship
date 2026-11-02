"""TF-IDF vectorizer and cosine similarity using only numpy and stdlib.

Implements a lightweight TF-IDF + cosine similarity pipeline without
scikit-learn or scipy dependencies.
"""

from __future__ import annotations

import math
from collections import Counter
from typing import Dict, List, Optional, Tuple

import numpy as np

from .preprocessing import tokenize


class TfidfVectorizer:
    """Lightweight TF-IDF vectorizer operating on pre-tokenized documents.
    
    Computes term frequency–inverse document frequency weights and supports
    cosine similarity queries against the fitted corpus.
    """

    def __init__(self):
        self._vocabulary: Dict[str, int] = {}  # term -> column index
        self._idf: Optional[np.ndarray] = None
        self._tfidf_matrix: Optional[np.ndarray] = None  # (n_docs, n_terms)
        self._n_docs: int = 0

    @property
    def vocabulary(self) -> Dict[str, int]:
        return dict(self._vocabulary)

    def fit_transform(self, documents: List[List[str]]) -> np.ndarray:
        """Fit vocabulary and IDF weights, then transform documents to TF-IDF vectors.
        
        Args:
            documents: List of tokenized documents (each is a list of stemmed terms).
            
        Returns:
            TF-IDF matrix of shape (n_docs, n_terms).
        """
        self._n_docs = len(documents)
        if self._n_docs == 0:
            self._vocabulary = {}
            self._idf = np.array([])
            self._tfidf_matrix = np.empty((0, 0))
            return self._tfidf_matrix

        # 1. Build vocabulary from all documents
        vocab: Dict[str, int] = {}
        for doc in documents:
            for term in set(doc):  # unique terms per document
                if term not in vocab:
                    vocab[term] = len(vocab)
        self._vocabulary = vocab
        n_terms = len(vocab)

        if n_terms == 0:
            self._idf = np.array([])
            self._tfidf_matrix = np.zeros((self._n_docs, 0))
            return self._tfidf_matrix

        # 2. Compute document frequency (DF) for each term
        df = np.zeros(n_terms, dtype=np.float64)
        for doc in documents:
            seen = set()
            for term in doc:
                if term in vocab and term not in seen:
                    df[vocab[term]] += 1
                    seen.add(term)

        # 3. Compute IDF: log((1 + N) / (1 + df)) + 1  (smooth IDF, sklearn convention)
        self._idf = np.log((1 + self._n_docs) / (1 + df)) + 1.0

        # 4. Compute TF for each document and multiply by IDF
        tf_matrix = np.zeros((self._n_docs, n_terms), dtype=np.float64)
        for i, doc in enumerate(documents):
            counts = Counter(doc)
            for term, count in counts.items():
                if term in vocab:
                    tf_matrix[i, vocab[term]] = count

        # Sub-linear TF: 1 + log(tf) if tf > 0
        mask = tf_matrix > 0
        tf_matrix[mask] = 1 + np.log(tf_matrix[mask])

        # TF-IDF = TF * IDF
        self._tfidf_matrix = tf_matrix * self._idf

        # 5. L2-normalize each row for cosine similarity
        norms = np.linalg.norm(self._tfidf_matrix, axis=1, keepdims=True)
        norms[norms == 0] = 1.0  # avoid division by zero
        self._tfidf_matrix = self._tfidf_matrix / norms

        return self._tfidf_matrix

    def transform(self, documents: List[List[str]]) -> np.ndarray:
        """Transform new documents using the fitted vocabulary and IDF weights.
        
        Terms not in the fitted vocabulary are ignored.
        
        Args:
            documents: List of tokenized documents.
            
        Returns:
            TF-IDF matrix of shape (n_docs, n_terms).
        """
        if self._idf is None or len(self._vocabulary) == 0:
            return np.zeros((len(documents), 0))

        n_terms = len(self._vocabulary)
        tf_matrix = np.zeros((len(documents), n_terms), dtype=np.float64)

        for i, doc in enumerate(documents):
            counts = Counter(doc)
            for term, count in counts.items():
                if term in self._vocabulary:
                    tf_matrix[i, self._vocabulary[term]] = count

        mask = tf_matrix > 0
        tf_matrix[mask] = 1 + np.log(tf_matrix[mask])

        tfidf = tf_matrix * self._idf

        norms = np.linalg.norm(tfidf, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        tfidf = tfidf / norms

        return tfidf

    def get_top_terms(self, vector: np.ndarray, top_n: int = 10) -> List[Tuple[str, float]]:
        """Return the top-weighted terms in a TF-IDF vector.
        
        Args:
            vector: 1-D TF-IDF vector.
            top_n: Number of top terms to return.
            
        Returns:
            List of (term, weight) tuples sorted by descending weight.
        """
        if len(vector) == 0:
            return []
        inv_vocab = {idx: term for term, idx in self._vocabulary.items()}
        indices = np.argsort(vector)[::-1][:top_n]
        return [(inv_vocab[i], float(vector[i])) for i in indices if vector[i] > 0]


def cosine_similarity(query_vec: np.ndarray, corpus_matrix: np.ndarray) -> np.ndarray:
    """Compute cosine similarity between a query vector and each row in a corpus matrix.
    
    Both inputs are expected to be L2-normalized.
    
    Args:
        query_vec: 1-D array of shape (n_terms,).
        corpus_matrix: 2-D array of shape (n_docs, n_terms).
        
    Returns:
        1-D array of similarity scores of shape (n_docs,).
    """
    if corpus_matrix.shape[1] == 0 or query_vec.shape[0] == 0:
        return np.zeros(corpus_matrix.shape[0])
    return corpus_matrix @ query_vec

